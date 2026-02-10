const express = require('express');
const { supabase } = require('../lib/supabase');
const auth = require('../middlewares/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      name,
      avatar_url,
      bio,
      phone,
      mattermost,
      admin_assignments (
        is_active,
        role:roles(name),
        department:departments(name)
      )
    `)
    .order('name');

  if (error) {
    console.error('Team fetch failed:', error);
    return res.status(500).json({ error: 'Failed to load team' });
  }

  const team = data.map(user => {
    const assignment = user.admin_assignments?.[0];

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      phone: user.phone,
      mattermost: user.mattermost,

      // ✅ SINGLE SOURCE OF TRUTH
      role: assignment?.is_active
        ? assignment?.role?.name ?? 'member'
        : 'member',

      department: assignment?.is_active
        ? assignment?.department?.name ?? 'general'
        : 'general',
    };
  });

  res.json(team);
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
