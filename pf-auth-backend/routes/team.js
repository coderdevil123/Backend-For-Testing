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

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name');
  
  const deptMap = new Map(departments.map(d => [d.id, d.name]));

  const assignMap = new Map(assignments.map(a => [a.user_email, a]));

  // 4️⃣ Merge (ADMIN ASSIGNMENT OVERRIDES PROFILE)
  const result = [];

  // First: process all profiles (existing behavior)
  profiles.forEach(p => {
    const a = assignMap.get(p.email);

    result.push({
      ...p,
      role: a?.role_id ? roleMap.get(a.role_id) : p.role || 'member',
      department: a?.department_id
        ? deptMap.get(a.department_id)
        : p.department || 'general',
    });
  });

  // Second: add users who exist in admin_assignments but NOT in profiles
  assignments.forEach(a => {
    const alreadyExists = profiles.find(p => p.email === a.user_email);

    if (!alreadyExists) {
      result.push({
        id: null,
        email: a.user_email,
        name: a.user_email, // fallback to email
        avatar_url: null,
        bio: null,
        phone: null,
        mattermost: null,
        role: roleMap.get(a.role_id) || 'member',
        department: deptMap.get(a.department_id) || 'general',
      });
    }
  });

  res.json(result);
});


router.get('/public', async (req, res) => {
  const { data: profiles } = await supabase
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

  const { data: assignments } = await supabase
    .from('admin_assignments')
    .select('user_email, role_id, department_id')
    .eq('is_active', true);

  const { data: roles } = await supabase
    .from('roles')
    .select('id, name');

  const roleMap = new Map(roles.map(r => [r.id, r.name]));

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name');
  
  const deptMap = new Map(departments.map(d => [d.id, d.name]));
  const assignMap = new Map(assignments.map(a => [a.user_email, a]));

  const result = profiles.map(p => {
    const a = assignMap.get(p.email);
    return {
      ...p,
      role: a?.role_id ? roleMap.get(a.role_id) : p.role || 'member',
      department: a?.department_id
      ? deptMap.get(a.department_id)
      : p.department || 'general',
    };
  });

  res.json(result);
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
