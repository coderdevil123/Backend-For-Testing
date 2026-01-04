const express = require('express');
const { supabase } = require('../lib/supabase.js');
const router = express.Router();

const auth = require('../middlewares/auth');

router.get('/', auth, async (req, res) => {
  const userEmail = req.user.email;

  const { data, error } = await supabase.rpc(
    'get_announcements_with_read_status',
    { user_email: userEmail }
  );

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const {
    title,
    content,
    category,
    recipients,
    taggedEmails
  } = req.body;

  const creatorName =
    req.user.name || req.user.email.split('@')[0];

  const { error } = await supabase
    .from('announcements')
    .insert({
      title,
      content,
      category,
      recipients,
      tagged_emails: recipients === 'specific' ? taggedEmails : null,
      created_by: req.user.email,
      created_by_name: creatorName,
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({ success: true });
});

router.post('/:id/read', auth, async (req, res) => {
  const announcementId = req.params.id;
  const userEmail = req.user.email;

  const { error } = await supabase
    .from('announcement_reads')
    .upsert({
      announcement_id: announcementId,
      user_email: userEmail,
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});


module.exports = router;
