const express = require('express');
const { supabase } = require('../../lib/supabase');

const router = express.Router();

// GET all roles
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('level');

  if (error) return res.status(500).json(error);
  res.json(data);
});

// CREATE role
router.post('/', async (req, res) => {
  const { name, level } = req.body;

  if (!name || level === undefined) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const { error } = await supabase.from('roles').insert({
    name,
    level,
    created_by: req.user.email,
  });

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

module.exports = router;
