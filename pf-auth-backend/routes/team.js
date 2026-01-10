const express = require('express');
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`email,name,avatar_url,bio,phone,role,department`)
    .order('name');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

module.exports = router;
