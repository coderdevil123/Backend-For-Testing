const express = require('express');
const { supabase } = require('../lib/supabase.js');
const router = express.Router();

const auth = require('../middlewares/auth');

router.get('/', auth, async (req, res) => {
  const userEmail = req.user.email;

  // 1️⃣ Get announcements with READ status
  const { data: announcements, error } = await supabase.rpc(
    'get_announcements_with_read_status',
    { user_email: userEmail }
  );

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // 2️⃣ Get pins for this user
  const { data: pins, error: pinError } = await supabase
    .from('announcement_pins')
    .select('announcement_id')
    .eq('user_email', userEmail);

  if (pinError) {
    return res.status(500).json({ error: pinError.message });
  }

  const pinnedSet = new Set(
    (pins || []).map(p => p.announcement_id)
  );

  // 3️⃣ Attach is_pinned per announcement
  const enriched = (announcements || []).map(a => ({
    ...a,
    is_pinned: pinnedSet.has(a.id),
  }));

  res.json(enriched);
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

// PIN / UNPIN announcement (per user)
router.post('/:id/pin', auth, async (req, res) => {
  const announcementId = req.params.id;
  const userEmail = req.user.email;

  // Check if already pinned
  const { data: existing } = await supabase
    .from('announcement_pins')
    .select('id')
    .eq('announcement_id', announcementId)
    .eq('user_email', userEmail)
    .single();

  if (existing) {
    // UNPIN
    await supabase
      .from('announcement_pins')
      .delete()
      .eq('announcement_id', announcementId)
      .eq('user_email', userEmail);

    return res.json({ pinned: false });
  }

  // PIN
  await supabase.from('announcement_pins').insert({
    announcement_id: announcementId,
    user_email: userEmail,
  });

  res.json({ pinned: true });
});

module.exports = router;
