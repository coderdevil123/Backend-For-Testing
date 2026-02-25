const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const auth = require('../middlewares/auth');
const cache = require('../services/cache');

// ── GET /api/tasks
router.get('/', auth, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '20'));
    const offset = (page - 1) * limit;

    const { status, search, dateFilter, dateRange } = req.query;
    const isUnfiltered = !status && !search && !dateFilter && !dateRange;

    if (page === 1 && isUnfiltered) {
      const cached = cache.getTasks(userEmail);
      if (cached) return res.json(cached);
    }

    let conditions = [`t.assigned_to_email = $1`];
    let values = [userEmail];
    let index = 2;

    if (status && status !== 'all') {
      conditions.push(`t.status = $${index++}`);
      values.push(status);
    }

    if (search) {
      conditions.push(`t.title ILIKE $${index++}`);
      values.push(`%${search}%`);
    }

    if (dateFilter) {
      conditions.push(`t.created_at >= $${index++} AND t.created_at <= $${index++}`);
      values.push(`${dateFilter}T00:00:00`);
      values.push(`${dateFilter}T23:59:59`);
    }

    if (dateRange && dateRange !== 'all') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dateRange === 'today') {
        conditions.push(`t.created_at >= $${index++}`);
        values.push(today.toISOString());
      } else if (dateRange === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        conditions.push(`t.created_at >= $${index++} AND t.created_at < $${index++}`);
        values.push(yesterday.toISOString());
        values.push(today.toISOString());
      } else if (dateRange === 'last7') {
        const d = new Date();
        d.setDate(d.getDate() - 7);

        conditions.push(`t.created_at >= $${index++}`);
        values.push(d.toISOString());
      } else if (dateRange === 'last14') {
        const d = new Date();
        d.setDate(d.getDate() - 14);

        conditions.push(`t.created_at >= $${index++}`);
        values.push(d.toISOString());
      }
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // ── Main Query (LEFT JOIN meeting_summaries)
    const dataQuery = `
      SELECT 
        t.id,
        t.title,
        t.description,
        t.status,
        t.priority,
        t.created_at,
        t.issue_reported,
        t.meeting_id,
        ms.id AS meeting_summary_id,
        ms.full_report,
        ms.summary
      FROM tasks t
      LEFT JOIN meeting_summaries ms ON ms.id = t.meeting_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${index++}
      OFFSET $${index}
    `;

    values.push(limit);
    values.push(offset);

    const { rows } = await db.query(dataQuery, values);

    // ── Count Query
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM tasks t
      ${whereClause}
    `;

    const { rows: countRows } = await db.query(
      countQuery,
      values.slice(0, values.length - 2)
    );

    const total = countRows[0]?.total || 0;

    // ── Normalize meeting summary (same behavior as before)
    const normalized = rows.map(task => ({
      ...task,
      meeting_summary: task.summary
        ? JSON.stringify(task.summary, null, 2)
        : task.full_report || null,
      summary: undefined,
      full_report: undefined,
      meeting_summary_id: undefined,
    }));

    const response = {
      data: normalized,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit),
      },
    };

    if (page === 1 && isUnfiltered) {
      cache.setTasks(userEmail, response);
    }

    res.json(response);

  } catch (err) {
    console.error('Fetch tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ── PATCH /api/tasks/:id
router.patch('/:id', auth, async (req, res) => {
  try {
    const taskId    = req.params.id;
    const userEmail = req.user.email;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.query(
      'UPDATE tasks SET status = $1 WHERE id = $2',
      [status, taskId]
    );

    cache.delTasks(userEmail);
    cache.delManagerTasks();

    res.json({ success: true });

  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ── POST /api/tasks/:id/reassign
router.post('/:id/reassign', auth, async (req, res) => {
  try {
    const taskId    = req.params.id;
    const fromEmail = req.user.email;
    const { toEmail } = req.body;

    if (!toEmail) {
      return res.status(400).json({ error: 'Target user required' });
    }

    await Promise.all([
      db.query(
        `INSERT INTO task_reassignment_requests (task_id, from_email, to_email)
         VALUES ($1, $2, $3)`,
        [taskId, fromEmail, toEmail]
      ),
      db.query(
        `INSERT INTO announcements
         (title, content, category, recipients, tagged_emails, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          'Task reassignment request',
          `${fromEmail} wants to reassign a task to you. Please accept or reject.`,
          'Task',
          'specific',
          [toEmail],
          fromEmail,
          fromEmail.split('@')[0],
        ]
      ),
    ]);

    cache.delAnnouncements(toEmail);

    res.json({ success: true });

  } catch (err) {
    console.error('Reassign error:', err);
    res.status(500).json({ error: 'Failed to create reassignment request' });
  }
});

// ── GET /api/tasks/reassign/inbox
router.get('/reassign/inbox', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `
      SELECT 
        r.id,
        r.status,
        r.created_at,
        r.from_email,
        t.id AS task_id,
        t.title
      FROM task_reassignment_requests r
      JOIN tasks t ON t.id = r.task_id
      WHERE r.to_email = $1
      AND r.status = 'pending'
      ORDER BY r.created_at DESC
      LIMIT 50
      `,
      [req.user.email]
    );

    res.json(rows);

  } catch (err) {
    console.error('Inbox error:', err);
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// ── POST /api/tasks/reassign/:id
router.post('/reassign/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const email = req.user.email;

    const { rows } = await db.query(
      'SELECT * FROM task_reassignment_requests WHERE id = $1',
      [id]
    );

    const request = rows[0];

    if (!request || request.to_email !== email) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    await db.query(
      'UPDATE task_reassignment_requests SET status = $1 WHERE id = $2',
      [action, id]
    );

    if (action === 'accepted') {
      await db.query(
        'UPDATE tasks SET assigned_to_email = $1 WHERE id = $2',
        [email, request.task_id]
      );
    }

    cache.delTasks(email);
    cache.delTasks(request.from_email);
    cache.delManagerTasks();

    res.json({ success: true });

  } catch (err) {
    console.error('Accept/Reject error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

module.exports = router;