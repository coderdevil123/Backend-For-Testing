const express = require('express');
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`email,name,avatar_url,bio,phone,mattermost,role,department`)
    .order('name');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

router.get('/public', async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`email,name,avatar_url,bio,phone,mattermost,role,department`)
    .order('name');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

router.get('/me', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, department')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(500).json(error);

  res.json(data);
});

module.exports = router;
