const express = require('express');
const { supabase } = require('../lib/supabase.js');
const router = express.Router();
const auth   = require('../middlewares/auth');
const cache  = require('../services/cache');

// GET /api/announcements
router.get('/', auth, async (req, res) => {
  try {
    const userEmail = req.user.email;

    const cached = cache.getAnnouncements(userEmail);
    if (cached) return res.json(cached);

    const [annRes, pinRes] = await Promise.all([
      supabase.rpc('get_announcements_with_read_status', { user_email: userEmail }),
      supabase.from('announcement_pins').select('announcement_id').eq('user_email', userEmail),
    ]);

    if (annRes.error || pinRes.error)
      return res.status(500).json({ error: 'Failed to load announcements' });

    const pinnedSet = new Set((pinRes.data || []).map(p => p.announcement_id));
    const enriched  = (annRes.data || []).map(a => ({ ...a, is_pinned: pinnedSet.has(a.id) }));

    cache.setAnnouncements(userEmail, enriched);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/announcements
router.post('/', auth, async (req, res) => {
  const { title, content, category, recipients, tagged_emails, related_task_id } = req.body;

  if (!title || !content || !recipients)
    return res.status(400).json({ error: 'Missing required fields' });

  if (recipients === 'specific' && (!Array.isArray(tagged_emails) || !tagged_emails.length))
    return res.status(400).json({ error: 'Tagged emails required' });

  const { error } = await supabase.from('announcements').insert({
    title,
    content,
    category,
    recipients,
    tagged_emails:   recipients === 'specific' ? tagged_emails : null,
    related_task_id: related_task_id || null,
    created_by:      req.user.email,
    created_by_name: req.user.name || req.user.email.split('@')[0],
  });

  if (error) {
    console.error('Announcement insert error:', error);
    return res.status(500).json({ error: error.message });
  }

  if (recipients === 'specific' && Array.isArray(tagged_emails)) {
    tagged_emails.forEach(email => cache.delAnnouncements(email));
  }

  res.status(201).json({ success: true });
});

// POST /api/announcements/:id/read
router.post('/:id/read', auth, async (req, res) => {
  const { error } = await supabase.from('announcement_reads').upsert({
    announcement_id: req.params.id,
    user_email:      req.user.email,
  });

  if (error) return res.status(500).json({ error: error.message });

  cache.delAnnouncements(req.user.email);
  res.json({ success: true });
});

// POST /api/announcements/:id/pin
router.post('/:id/pin', auth, async (req, res) => {
  const announcementId = req.params.id;
  const userEmail      = req.user.email;

  const { data: existing } = await supabase
    .from('announcement_pins')
    .select('id')
    .eq('announcement_id', announcementId)
    .eq('user_email', userEmail)
    .single();

  if (existing) {
    await supabase.from('announcement_pins')
      .delete()
      .eq('announcement_id', announcementId)
      .eq('user_email', userEmail);
    cache.delAnnouncements(userEmail);
    return res.json({ pinned: false });
  }

  await supabase.from('announcement_pins').insert({ announcement_id: announcementId, user_email: userEmail });
  cache.delAnnouncements(userEmail);
  res.json({ pinned: true });
});

// DELETE /api/announcements/:id
router.delete('/:id', auth, async (req, res) => {
  const announcementId = req.params.id;
  const userEmail      = req.user.email;

  const { data: announcement, error: fetchError } = await supabase
    .from('announcements')
    .select('created_by')
    .eq('id', announcementId)
    .single();

  if (fetchError || !announcement)
    return res.status(404).json({ error: 'Announcement not found' });

  if (announcement.created_by !== userEmail)
    return res.status(403).json({ error: 'Not allowed to delete this announcement' });

  const { error: deleteError } = await supabase.from('announcements').delete().eq('id', announcementId);

  if (deleteError) return res.status(500).json({ error: deleteError.message });

  cache.delAnnouncements(userEmail);
  res.json({ success: true });
});

module.exports = router;