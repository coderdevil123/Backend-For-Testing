import express from 'express';
import { supabase } from '../lib/supabase.js';

const router = express.Router();

// GET announcements for logged-in user
router.get('/', async (req, res) => {
  const userEmail = req.user.email; // from passport

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

// CREATE announcement (admin)
router.post('/', async (req, res) => {
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
      created_by: req.user.email
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

export default router;
