const express = require('express');
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  // 1️⃣ Get profiles
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      name,
      avatar_url,
      bio,
      phone,
      mattermost,
      role,
      department
    `)
    .order('name');

  if (pErr) {
    console.error(pErr);
    return res.status(500).json({ error: 'Failed to load profiles' });
  }

  // 2️⃣ Get active admin assignments
  const { data: assignments, error: aErr } = await supabase
    .from('admin_assignments')
    .select('user_email, role_id, department_id')
    .eq('is_active', true);

  if (aErr) {
    console.error(aErr);
    return res.status(500).json({ error: 'Failed to load assignments' });
  }

  // 3️⃣ Resolve role + department names
  const { data: roles } = await supabase
    .from('roles')
    .select('id, name');

  const roleMap = new Map(roles.map(r => [r.id, r.name]));
  const assignMap = new Map(assignments.map(a => [a.user_email, a]));

  // 4️⃣ Merge (ADMIN ASSIGNMENT OVERRIDES PROFILE)
  const result = profiles.map(p => {
    const a = assignMap.get(p.email);

    return {
      ...p,
      role: a?.role_id ? roleMap.get(a.role_id) : p.role || 'member',
      department: a?.department_id || p.department || 'general',
    };
  });

  res.json(result);
});


router.get('/public', async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`id, email, name, avatar_url, bio, phone, mattermost, role, department`)
    .order('name');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

router.get('/me', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('email, role, department')
    .eq('email', req.user.email)
    .single();

  if (error) {
    return res.status(500).json(error);
  }

  res.json(data);
});

module.exports = router;
