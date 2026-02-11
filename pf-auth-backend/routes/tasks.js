const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');

/**
 * GET /api/tasks
 * Fetch tasks for logged-in user
 */
router.get('/', auth, async (req, res) => {
  const userEmail = req.user.email;

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      meeting_summaries (
        summary
      )
    `)
    .eq('assigned_to_email', userEmail)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fetch tasks error:', error);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }

    const normalized = data.map(task => ({
    ...task,
    meeting_summary:
      task.meeting_summaries?.summary
        ? JSON.stringify(task.meeting_summaries.summary, null, 2)
        : null,
  }));

  res.json(normalized);

  // res.json(data);
});

/**
 * PATCH /api/tasks/:id
 * Update task status (pending, completed, blocked, etc)
 */
router.patch('/:id', auth, async (req, res) => {
  const taskId = req.params.id;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  const { error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', taskId);

  if (error) {
    console.error('Update task error:', error);
    return res.status(500).json({ error: 'Failed to update task' });
  }

  res.json({ success: true });
});

router.post('/:id/reassign', auth, async (req, res) => {
  const taskId = req.params.id;
  const fromEmail = req.user.email;
  const { toEmail } = req.body;

  if (!toEmail) {
    return res.status(400).json({ error: 'Target user required' });
  }

  // Create reassignment request
  const { error } = await supabase
    .from('task_reassignment_requests')
    .insert({
      task_id: taskId,
      from_email: fromEmail,
      to_email: toEmail,
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // 🔔 Create announcement for target user
  await supabase.from('announcements').insert({
    title: 'Task reassignment request',
    content: `${fromEmail} wants to reassign a task to you. Please accept or reject.`,
    category: 'Task',
    recipients: 'specific',
    tagged_emails: [toEmail],
    created_by: fromEmail,
    created_by_name: fromEmail.split('@')[0],
  });

  res.json({ success: true });
});

router.post('/reassign/:requestId', auth, async (req, res) => {
  const { requestId } = req.params;
  const { action } = req.body; // accepted | rejected

  const { data: reqRow } = await supabase
    .from('task_reassignment_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (!reqRow || reqRow.to_email !== req.user.email) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  if (action === 'accepted') {
    await supabase
      .from('tasks')
      .update({ assigned_to_email: reqRow.to_email })
      .eq('id', reqRow.task_id);
  }

  await supabase
    .from('task_reassignment_requests')
    .update({ status: action })
    .eq('id', requestId);

  res.json({ success: true });
});

// GET /api/tasks/reassign/inbox
router.get('/reassign/inbox', auth, async (req, res) => {
  const email = req.user.email;

  const { data, error } = await supabase
    .from('task_reassignment_requests')
    .select(`
      id,
      status,
      created_at,
      tasks (
        id,
        title
      ),
      from_email
    `)
    .eq('to_email', email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// POST /api/tasks/reassign/:id
router.post('/reassign/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // accepted | rejected
  const email = req.user.email;

  const { data: request } = await supabase
    .from('task_reassignment_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (!request || request.to_email !== email) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  if (action === 'accepted') {
    await supabase
      .from('tasks')
      .update({ assigned_to_email: email })
      .eq('id', request.task_id);
  }

  await supabase
    .from('task_reassignment_requests')
    .update({ status: action })
    .eq('id', id);

  res.json({ success: true });
});

// router.post('/from-mattermost', async (req, res) => {
//   const { taskTitle, assignedTo, meetingData } = req.body;

//   // Insert summary
//   const { data: meeting } = await supabase
//     .from('meeting_summaries')
//     .insert(meetingData)
//     .select()
//     .single();

//   // Insert task
//   await supabase
//     .from('tasks')
//     .insert({
//       title: taskTitle,
//       assigned_to_email: assignedTo,
//       meeting_id: meeting.id
//     });

//   res.json({ success: true });
// });


module.exports = router;
