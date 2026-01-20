const express = require('express');
const router = express.Router();
const { supabase }= require('../lib/supabase');
const auth = require('../middlewares/auth');

/**
 * GET /api/tasks
 * Get tasks for logged-in user
 */
router.get('/', auth, async (req, res) => {
  const userEmail = req.user.email;

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      due_date,
      task_status (
        is_completed
      )
    `)
    .eq('assigned_to', userEmail)
    .eq('task_status.user_email', userEmail);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }

  const tasks = data.map(task => ({
    id: task.id,
    title: task.title,
    description: task.description,
    due_date: task.due_date,
    is_completed: task.task_status?.[0]?.is_completed || false,
  }));

  res.json(tasks);
});

/**
 * POST /api/tasks/:id/toggle
 * Toggle task completion
 */
router.post('/:id/toggle', auth, async (req, res) => {
  const taskId = req.params.id;
  const userEmail = req.user.email;

  const { data: existing } = await supabase
    .from('task_status')
    .select('*')
    .eq('task_id', taskId)
    .eq('user_email', userEmail)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('task_status')
      .update({
        is_completed: !existing.is_completed,
        completed_at: !existing.is_completed ? new Date() : null,
      })
      .eq('id', existing.id);

    if (error) return res.status(500).json({ error: 'Update failed' });
  } else {
    const { error } = await supabase
      .from('task_status')
      .insert({
        task_id: taskId,
        user_email: userEmail,
        is_completed: true,
        completed_at: new Date(),
      });

    if (error) return res.status(500).json({ error: 'Insert failed' });
  }

  res.json({ success: true });
});

module.exports = router;
