const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');
const cache = require('../services/cache');

// GET /api/tasks
router.get('/', auth, async (req, res) => {
  const userEmail = req.user.email;
  const page  = Math.max(1, parseInt(req.query.page  || '1'));
  const limit = Math.min(50,  parseInt(req.query.limit || '20'));
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  const { status, search, dateFilter, dateRange } = req.query;

  const isUnfiltered = !status && !search && !dateFilter && !dateRange;
  if (page === 1 && isUnfiltered) {
    const cached = cache.getTasks(userEmail);
    if (cached) return res.json(cached);
  }

  let query = supabase
    .from('tasks')
    .select(`
      id, title, description, status, priority,
      created_at, issue_reported, meeting_id,
      meeting_summaries ( id, full_report, summary )
    `, { count: 'exact' })
    .eq('assigned_to_email', userEmail)
    .order('created_at', { ascending: false })
    .range(from, to);

  // Server-side filters
  if (status && status !== 'all') query = query.eq('status', status);
  if (search)                      query = query.ilike('title', `%${search}%`);
  if (dateFilter) {
    query = query
      .gte('created_at', `${dateFilter}T00:00:00`)
      .lte('created_at', `${dateFilter}T23:59:59`);
  }
  if (dateRange && dateRange !== 'all') {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (dateRange === 'today') {
      query = query.gte('created_at', today.toISOString());
    } else if (dateRange === 'yesterday') {
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      query = query.gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString());
    } else if (dateRange === 'last7') {
      const d = new Date(); d.setDate(d.getDate() - 7);
      query = query.gte('created_at', d.toISOString());
    } else if (dateRange === 'last14') {
      const d = new Date(); d.setDate(d.getDate() - 14);
      query = query.gte('created_at', d.toISOString());
    }
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Fetch tasks error:', error);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }

  const normalized = (data || []).map(task => ({
    ...task,
    meeting_summary: task.meeting_summaries?.summary
      ? JSON.stringify(task.meeting_summaries.summary, null, 2)
      : task.meeting_summaries?.full_report || null,
    meeting_summaries: undefined,
  }));

  const response = {
    data: normalized,
    pagination: {
      page, limit, total: count,
      pages: Math.ceil(count / limit),
      hasMore: page < Math.ceil(count / limit),
    },
  };

  if (page === 1 && isUnfiltered) cache.setTasks(userEmail, response);
  res.json(response);
});

// PATCH /api/tasks/:id
router.patch('/:id', auth, async (req, res) => {
  const taskId    = req.params.id;
  const userEmail = req.user.email;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });

  const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
  if (error) return res.status(500).json({ error: 'Failed to update task' });

  cache.delTasks(userEmail);
  cache.delManagerTasks();
  res.json({ success: true });
});

// POST /api/tasks/:id/reassign
router.post('/:id/reassign', auth, async (req, res) => {
  const taskId    = req.params.id;
  const fromEmail = req.user.email;
  const { toEmail } = req.body;
  if (!toEmail) return res.status(400).json({ error: 'Target user required' });

  const [{ error: reqErr }] = await Promise.all([
    supabase.from('task_reassignment_requests').insert({
      task_id: taskId, from_email: fromEmail, to_email: toEmail,
    }),
    supabase.from('announcements').insert({
      title: 'Task reassignment request',
      content: `${fromEmail} wants to reassign a task to you. Please accept or reject.`,
      category: 'Task', recipients: 'specific',
      tagged_emails: [toEmail], created_by: fromEmail,
      created_by_name: fromEmail.split('@')[0],
    }),
  ]);

  if (reqErr) return res.status(500).json({ error: reqErr.message });
  cache.delAnnouncements(toEmail);
  res.json({ success: true });
});

// GET /api/tasks/reassign/inbox
router.get('/reassign/inbox', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('task_reassignment_requests')
    .select(`id, status, created_at, from_email, tasks ( id, title )`)
    .eq('to_email', req.user.email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/tasks/reassign/:id (accept/reject)
router.post('/reassign/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const email = req.user.email;

  const { data: request } = await supabase
    .from('task_reassignment_requests').select('*').eq('id', id).single();

  if (!request || request.to_email !== email)
    return res.status(403).json({ error: 'Not allowed' });

  const updates = [
    supabase.from('task_reassignment_requests').update({ status: action }).eq('id', id),
  ];
  if (action === 'accepted') {
    updates.push(
      supabase.from('tasks').update({ assigned_to_email: email }).eq('id', request.task_id)
    );
  }
  await Promise.all(updates);

  cache.delTasks(email);
  cache.delTasks(request.from_email);
  cache.delManagerTasks();
  res.json({ success: true });
});

module.exports = router;