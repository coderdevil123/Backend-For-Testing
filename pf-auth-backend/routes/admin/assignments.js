const express = require('express');
const { supabase } = require('../../lib/supabase');
const cache = require('../../services/cache');
const router = express.Router();

// Assign role
router.patch('/', async (req, res) => {
  const { email, role_id, department_id } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const { error } = await supabase
    .from('admin_assignments')
    .upsert({
      user_email: email,
      role_id: role_id || null,
      department_id: department_id || null,
      assigned_by: req.user.email,
      is_active: true,
    }, {
      onConflict: 'user_email',
    });

  if (error) {
    console.error('Assignment update failed:', error);
    return res.status(500).json({ error: 'Update failed' });
  }

  res.json({ success: true });
});


// Revoke access
router.delete('/:email', async (req, res) => {
  const { email } = req.params;

  const { error } = await supabase
    .from('admin_assignments')
    .update({ is_active: false })
    .eq('user_email', email);

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

router.get('/', async (req, res) => {
  const cached = cache.get('assignments');
  if (cached) return res.json(cached);

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('email, name')
    .order('name');

  if (pErr) {
    console.error(pErr);
    return res.status(500).json({ error: 'Failed to load profiles' });
  }

  const { data: assignments, error: aErr } = await supabase
    .from('admin_assignments')
    .select('user_email, role_id, department_id')
    .eq('is_active', true);

  if (aErr) {
    console.error(aErr);
    return res.status(500).json({ error: 'Failed to load assignments' });
  }

  // 🔑 map assignments by email
  const map = new Map(
    assignments.map(a => [a.user_email, a])
  );

  const result = profiles.map(p => ({
    email: p.email,
    name: p.name,
    role_id: map.get(p.email)?.role_id ?? null,
    department_id: map.get(p.email)?.department_id ?? null,
  }));

  cache.set('assignments', result);
  res.json(result);
});

module.exports = router;
