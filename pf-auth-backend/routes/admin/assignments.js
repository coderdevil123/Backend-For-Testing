const express = require('express');
const { supabase } = require('../../lib/supabase');

const router = express.Router();

// Assign role
router.post('/', async (req, res) => {
  const { email, role_id, department_id } = req.body;

  if (!email || !role_id) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const { error } = await supabase
    .from('admin_assignments')
    .upsert({
      email,
      role_id,
      department_id: department_id || null,
      assigned_by: req.user.email,
      is_active: true,
    });

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

// Revoke access
router.delete('/:email', async (req, res) => {
  const { email } = req.params;

  const { error } = await supabase
    .from('admin_assignments')
    .update({ is_active: false })
    .eq('email', email);

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

module.exports = router;
