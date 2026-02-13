const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');

/**
 * GET /api/manager/tasks
 * Manager can see ALL tasks (filter frontend handles)
 */
router.get('/tasks', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      status,
      priority,
      created_at,
      assigned_to_email,
      profiles:assigned_to_email (
        name,
        department
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch manager tasks' });
  }

  // normalize
  const tasks = data.map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    created_at: t.created_at,
    assigned_to_email: t.assigned_to_email,
    assigned_to_name: t.profiles?.name,
    department: t.profiles?.department,
  }));

  res.json(tasks);
});

module.exports = router;
