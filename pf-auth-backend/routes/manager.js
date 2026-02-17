const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');

/**
 * GET /api/manager/tasks
 * Manager can see ALL tasks (filter frontend handles)
 */
router.get('/tasks', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        status,
        priority,
        created_at,
        assigned_to_email
        profiles!tasks_assigned_to_email_fkey (
          department
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Manager task fetch error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error('Manager tasks crash:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/update-task-status', auth, async (req, res) => {
  const { taskId, status } = req.body;

  if (!taskId || !status) {
    return res.status(400).json({ error: 'TaskId and status required' });
  }

  const { error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', taskId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});


module.exports = router;
