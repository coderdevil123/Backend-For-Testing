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
    tagged_emails,
    related_task_id
  } = req.body;

  if (!title || !content || !recipients) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (recipients === 'specific') {
    if (!Array.isArray(tagged_emails) || tagged_emails.length === 0) {
      return res.status(400).json({ error: 'Tagged emails required' });
    }
  }

  const creatorName =
    req.user.name || req.user.email.split('@')[0];

  const { error } = await supabase
    .from('announcements')
    .insert({
      title,
      content,
      category,
      recipients,
      tagged_emails: recipients === 'specific' ? tagged_emails : null,
      related_task_id: related_task_id || null,
      created_by: req.user.email,
      created_by_name: creatorName,
    });

  if (error) {
    console.error('Announcement insert error:', error);
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

// DELETE announcement (global)
router.delete('/:id', auth, async (req, res) => {
  const announcementId = req.params.id;
  const userEmail = req.user.email;

  // 1️⃣ Fetch announcement
  const { data: announcement, error: fetchError } = await supabase
    .from('announcements')
    .select('created_by')
    .eq('id', announcementId)
    .single();

  if (fetchError || !announcement) {
    return res.status(404).json({ error: 'Announcement not found' });
  }

  // 2️⃣ Authorization check
  // Allow delete only if creator (or later: admin)
  if (announcement.created_by !== userEmail) {
    return res.status(403).json({ error: 'Not allowed to delete this announcement' });
  }

  // 3️⃣ Delete announcement
  const { error: deleteError } = await supabase
    .from('announcements')
    .delete()
    .eq('id', announcementId);

  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }

  // 🔥 Pins & reads auto-deleted via CASCADE
  res.json({ success: true });
});

module.exports = router;
