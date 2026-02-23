const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/supabase');
const auth  = require('../middlewares/auth');
const cache = require('../services/cache');

// ── GET /api/manager/tasks
router.get('/tasks', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50,  parseInt(req.query.limit || '20'));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const { status, department, memberEmail, search, dateFilter } = req.query;
    const isUnfiltered = !status && !department && !memberEmail && !search && !dateFilter;

    // ── Serve from cache on unfiltered page 1
    if (page === 1 && isUnfiltered) {
      const cached = cache.getManagerTasks();
      if (cached) return res.json(cached);
    }

    // ── Always fetch assignments + departments in PARALLEL ───────────────────
    // Pull from cache first, only DB-fetch what's missing
    let [assignments, departments] = [cache.getAssignments(), cache.getDepartments()];

    if (!assignments || !departments) {
      const fetches = await Promise.all([
        !assignments
          ? supabase.from('admin_assignments').select('user_email,department_id').eq('is_active', true)
          : Promise.resolve({ data: assignments }),
        !departments
          ? supabase.from('departments').select('id,name')
          : Promise.resolve({ data: departments }),
      ]);

      if (!assignments) {
        assignments = fetches[0].data || [];
        cache.setAssignments(assignments);
      }
      if (!departments) {
        departments = fetches[1].data || [];
        cache.setDepartments(departments);
      }
    }

    // ── Build lookup maps ────────────────────────────────────────────────────
    const assignmentMap = new Map(assignments.map(a => [a.user_email, a.department_id]));
    const departmentMap = new Map(departments.map(d => [d.id,    d.name]));
    // Reverse: dept name → list of user emails (used to push dept filter to DB)
    const deptEmailsMap = new Map(); // dept_name_lower → Set<email>
    for (const [email, deptId] of assignmentMap) {
      const deptName = departmentMap.get(deptId)?.toLowerCase().trim();
      if (!deptName) continue;
      if (!deptEmailsMap.has(deptName)) deptEmailsMap.set(deptName, new Set());
      deptEmailsMap.get(deptName).add(email);
    }

    // ── Build Supabase query with ALL filters pushed to DB ───────────────────
    let query = supabase
      .from('tasks')
      .select('id,title,status,priority,created_at,assigned_to_email', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.ilike('title', `%${search}%`);
    }
    if (dateFilter) {
      query = query
        .gte('created_at', `${dateFilter}T00:00:00`)
        .lte('created_at', `${dateFilter}T23:59:59`);
    }

    // Push department filter to DB using email list — accurate count + uses index
    if (department) {
      const emailSet = deptEmailsMap.get(department.toLowerCase().trim());
      if (!emailSet || emailSet.size === 0) {
        // No one in this department — short-circuit, return empty
        return res.json({
          data: [],
          pagination: { page, limit, total: 0, pages: 0, hasMore: false },
        });
      }
      query = query.in('assigned_to_email', [...emailSet]);
    }

    // memberEmail overrides department email filter
    if (memberEmail) {
      query = query.eq('assigned_to_email', memberEmail);
    }

    const { data: tasks, error: tErr, count } = await query;
    if (tErr) return res.status(500).json({ error: tErr.message });

    // ── Enrich tasks with department name (pure in-memory, no extra DB call) ─
    const enriched = (tasks || []).map(task => ({
      ...task,
      department: departmentMap.get(assignmentMap.get(task.assigned_to_email)) || null,
    }));

    const totalPages = Math.ceil((count || 0) / limit);
    const result = {
      data: enriched,
      pagination: {
        page, limit,
        total:   count || 0,
        pages:   totalPages,
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

// ── PATCH /api/manager/update-task-status ────────────────────────────────────
router.patch('/update-task-status', auth, async (req, res) => {
  const { taskId, status, assignedToEmail } = req.body;
  if (!taskId || !status)
    return res.status(400).json({ error: 'taskId and status required' });

  const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
  if (error) return res.status(500).json({ error: error.message });

  cache.delManagerTasks();
  if (assignedToEmail) cache.delTasks(assignedToEmail);
  res.json({ success: true });
});

module.exports = router;