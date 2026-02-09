const express = require('express');
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');

const router = express.Router();

router.patch('/update-role', auth, async (req, res) => {
  // 🔐 ADMIN CHECK
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { userId, role, department } = req.body;

  if (!userId || !role) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      role: role.toLowerCase(),
      department: department || null,
    })
    .eq('email', email);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Update failed' });
  }

  res.json({ success: true });
});

module.exports = router;
