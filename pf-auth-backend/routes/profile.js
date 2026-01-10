const express = require('express');
const jwt = require('jsonwebtoken');
const { supabase } = require('../lib/supabase');

const router = express.Router();

/* 🔐 Middleware */
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/* ✅ GET profile */
router.get('/', requireAuth, async (req, res) => {
  const { email } = req.user;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (error) return res.status(500).json(error);
  res.json(data);
});

/* ✅ UPDATE profile */
router.put('/', requireAuth, async (req, res) => {
  const { email } = req.user;
  const { name, phone, bio, location, avatar_url } = req.body;

  const { error } = await supabase
    .from('profiles')
    .update({
      name,
      phone,
      bio,
      location,
      avatar_url,
    })
    .eq('email', email);

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

router.post('/avatar', requireAuth, async (req, res) => {
  const { email } = req.user;
  const file = req.files?.avatar;

  if (!file) return res.status(400).json({ error: 'No file' });

  const ext = file.name.split('.').pop();
  const path = `${email}.${ext}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file.data, { upsert: true });

  if (error) return res.status(500).json(error);

  const { data } = supabase.storage
    .from('avatars')
    .getPublicUrl(path);

  // 🔒 Persist avatar URL
  await supabase
    .from('profiles')
    .update({ avatar_url: data.publicUrl })
    .eq('email', email);

  res.json({ avatar_url: data.publicUrl });
});


module.exports = router;
