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
    .select('*')
    .eq('assigned_to_email', userEmail)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fetch tasks error:', error);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }

  res.json(data);
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

module.exports = router;
