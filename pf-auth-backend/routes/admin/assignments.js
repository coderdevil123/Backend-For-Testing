const express = require('express');
const { supabase } = require('../../lib/supabase');

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
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      email,
      name,
      admin_assignments (
        role_id,
        department_id
      )
    `)
    .order('name');

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load assignments' });
  }

  const normalized = data.map(p => ({
    email: p.email,
    name: p.name,
    role_id: p.admin_assignments?.[0]?.role_id ?? null,
    department_id: p.admin_assignments?.[0]?.department_id ?? null,
  }));

  res.json(normalized);
});

module.exports = router;
