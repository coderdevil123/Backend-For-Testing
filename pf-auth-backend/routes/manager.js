const express = require('express');
const router  = express.Router();
const db      = require('../lib/db');
const auth    = require('../middlewares/auth');
const cache   = require('../services/cache');

// ── GET /api/manager/tasks
router.get('/tasks', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '20'));
    const offset = (page - 1) * limit;

    const { status, department, memberEmail, search, dateFilter } = req.query;
    const isUnfiltered = !status && !department && !memberEmail && !search && !dateFilter;

    if (page === 1 && isUnfiltered) {
      const cached = cache.getManagerTasks();
      if (cached) return res.json(cached);
    }

    // ── Fetch assignments + departments (parallel)
    let assignments = cache.getAssignments();
    let departments = cache.getDepartments();

    if (!assignments || !departments) {
      const [aRes, dRes] = await Promise.all([
        db.query('SELECT user_email, department_id FROM admin_assignments WHERE is_active = true'),
        db.query('SELECT id, name FROM departments')
      ]);

      assignments = aRes.rows;
      departments = dRes.rows;

      cache.setAssignments(assignments);
      cache.setDepartments(departments);
    }

    // ✅ FIX: Check for BOTH user_email and email depending on which route populated the cache
    const assignmentMap = new Map(assignments.map(a => [a.user_email || a.email, a.department_id]));
    const departmentMap = new Map(departments.map(d => [d.id, d.name]));

    // ── Build dynamic WHERE conditions
    let conditions = [];
    let values = [];
    let index = 1;

    if (status && status !== 'all') {
      conditions.push(`status = $${index++}`);
      values.push(status);
    }

    if (search) {
      conditions.push(`title ILIKE $${index++}`);
      values.push(`%${search}%`);
    }

    if (dateFilter) {
      conditions.push(`created_at >= $${index++} AND created_at <= $${index++}`);
      values.push(`${dateFilter}T00:00:00`);
      values.push(`${dateFilter}T23:59:59`);
    }

    if (memberEmail) {
      conditions.push(`assigned_to_email = $${index++}`);
      values.push(memberEmail);
    }

    // Department filter
    if (department) {
      const deptName = department.toLowerCase().trim();
      const emails = assignments
        .filter(a => departmentMap.get(a.department_id)?.toLowerCase() === deptName)
        // ✅ FIX: Check both keys here as well to prevent the filter from breaking
        .map(a => a.user_email || a.email);

      if (emails.length === 0) {
        return res.json({
          data: [],
          pagination: { page, limit, total: 0, pages: 0, hasMore: false },
        });
      }

      conditions.push(`assigned_to_email = ANY($${index++})`);
      values.push(emails);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // ── Fetch data
    const dataQuery = `
      SELECT id, title, status, priority, created_at, assigned_to_email
      FROM tasks
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${index++}
      OFFSET $${index}
    `;

    values.push(limit);
    values.push(offset);

    const { rows: tasks } = await db.query(dataQuery, values);

    // ── Count query
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM tasks
      ${whereClause}
    `;

    const { rows: countRows } = await db.query(countQuery, values.slice(0, values.length - 2));
    const total = countRows[0]?.total || 0;

    const enriched = tasks.map(task => ({
      ...task,
      department: departmentMap.get(assignmentMap.get(task.assigned_to_email)) || null,
    }));

    const totalPages = Math.ceil(total / limit);

    const result = {
      data: enriched,
      pagination: {
        page,
        limit,
        total,
        pages: totalPages,
        hasMore: page < totalPages,
      },
    };

    if (page === 1 && isUnfiltered) cache.setManagerTasks(result);

    res.json(result);

  } catch (err) {
    console.error('Manager tasks crash:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH update task status
router.patch('/update-task-status', auth, async (req, res) => {
  try {
    const { taskId, status, assignedToEmail } = req.body;
    if (!taskId || !status)
      return res.status(400).json({ error: 'taskId and status required' });

    await db.query(
      'UPDATE tasks SET status = $1 WHERE id = $2',
      [status, taskId]
    );

    cache.delManagerTasks();
    if (assignedToEmail) cache.delTasks(assignedToEmail);

    res.json({ success: true });

  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

module.exports = router;