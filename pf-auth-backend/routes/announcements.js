const express = require('express');
const { supabase } = require('../lib/supabase.js');
const router = express.Router();

const auth = require('../middlewares/auth');

router.get('/', auth, async (req, res) => {
  const userEmail = req.user.email;

  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .or(`recipients.eq.all,tagged_emails.cs.{${userEmail}}`)
    .order('created_at', { ascending: false });

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

  const { error } = await supabase
    .from('announcements')
    .insert({
      title,
      content,
      category,
      recipients,
      tagged_emails: recipients === 'specific' ? taggedEmails : null,
      created_by: req.user.email,
      created_by_name: req.user.name,
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({ success: true });
});


module.exports = router;
