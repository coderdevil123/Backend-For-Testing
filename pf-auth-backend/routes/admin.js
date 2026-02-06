const express = require('express');
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');

const router = express.Router();

router.patch('/update-role', auth, async (req, res) => {
  // 🔐 Only admin allowed
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { userId, role, department } = req.body;

  if (!userId || !role) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      role,
      department: department || null,
    })
    .eq('id', userId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

module.exports = router;
