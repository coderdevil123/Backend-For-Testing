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

module.exports = router;
