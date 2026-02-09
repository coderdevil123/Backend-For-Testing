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

  // ✅ ROLE → DEPARTMENT RULES
  let updatePayload = {
    role: role.toLowerCase(),
  };

  if (role === 'admin') {
    // 🔒 ADMIN has NO department
    updatePayload.department = 'leadership';
  } else if (['team_lead', 'intern'].includes(role)) {
    updatePayload.department = department || 'general';
  } else {
    // member
    updatePayload.department = 'general';
  }

  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('email', email);

  if (error) {
    console.error('Role update failed:', error);
    return res.status(500).json({ error: 'Update failed' });
  }

  res.json({ success: true });
});


module.exports = router;
