const express = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();

// GET all team members
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('email, name, avatar_url')
    .order('name');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

module.exports = router;
