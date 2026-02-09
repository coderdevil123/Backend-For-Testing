const express = require('express');
const { supabase } = require('../../lib/supabase');

const router = express.Router();

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('name');

  if (error) return res.status(500).json(error);
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Missing department name' });
  }

  const { error } = await supabase.from('departments').insert({
    name,
    created_by: req.user.email,
  });

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

module.exports = router;
