const express = require('express');
const jwt = require('jsonwebtoken');
const { supabase } = require('../lib/supabase');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();
const auth = require('../middlewares/auth');

/* ✅ GET profile */
router.get('/', auth, async (req, res) => {
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
router.put('/', auth, async (req, res) => {
  const { email } = req.user;
  const body = req.body || {};
  const { name, phone, bio, location, avatar_url, mattermost } = body;

  const { error } = await supabase
    .from('profiles')
    .update({
      name,
      phone,
      bio,
      location,
      avatar_url,
      mattermost,
    })
    .eq('email', email);

  if (error) return res.status(500).json(error);
    const { data: updatedProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single();

    if (fetchError) return res.status(500).json(fetchError);

    res.json(updatedProfile);

});

router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
    const { email } = req.user;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = file.originalname.split('.').pop();
    const path = `avatars/${email}.${ext}`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) return res.status(500).json(error);

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);

    await supabase
      .from('profiles')
      .update({ avatar_url: data.publicUrl })
      .eq('email', email);

    res.json({ avatar_url: data.publicUrl });
  }
);


module.exports = router;
