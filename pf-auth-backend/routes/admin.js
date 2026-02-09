const express = require('express');
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');

const router = express.Router();

router.patch('/update-role', auth, async (req, res) => {
  // 🔐 ADMIN CHECK
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { email, role, department } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const ALLOWED_ROLES = ['admin', 'team_lead', 'intern', 'member'];
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  let finalDepartment = department || 'general';

  if (role === 'admin') {
    finalDepartment = 'leadership';
  }

  if (role === 'member') {
    finalDepartment = 'general';
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      role: finalRole,
      department: finalDepartment,
    })
    .eq('email', email);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Update failed' });
  }

  res.json({ success: true });
});

module.exports = router;
