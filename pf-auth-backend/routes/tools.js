const express = require('express');
const jwt = require('jsonwebtoken');
const { supabase } = require('../lib/supabase');

const router = express.Router();

/* 🔐 Auth middleware */
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

/* ✅ GET all tools */
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json(error);
  res.json(data);
});

/* ✅ ADD tool */
router.post('/', requireAuth, async (req, res) => {
  const {
    name,
    url,
    tutorial_video,
    category,
    image,
    image_light,
    image_dark,
  } = req.body;

  if (!name || !url || !category) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { error } = await supabase.from('tools').insert({
    name,
    url,
    tutorial_video,
    category,
    description: '',
    rating: 0,
    users: 0,
    image,
    image_light,
    image_dark,
    created_by: req.user.email,
  });

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    url,
    tutorial_video,
    category,
    image,
    image_light,
    image_dark,
  } = req.body;

  const { error } = await supabase
    .from('tools')
    .update({
      name,
      description,
      url,
      tutorial_video,
      category,
      image,
      image_light,
      image_dark,
    })
    .eq('id', id);

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('tools')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json(error);
  res.json({ success: true });
});

module.exports = router;
