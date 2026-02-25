const express = require('express');
const db      = require('../lib/db');
const router  = express.Router();
const auth    = require('../middlewares/auth');
const cache   = require('../services/cache');

// ── GET /api/announcements
router.get('/', auth, async (req, res) => {
  try {
    const userEmail = req.user.email;

    const cached = cache.getAnnouncements(userEmail);
    if (cached) return res.json(cached);

    const { rows } = await db.query(
      `
      SELECT 
        a.*,
        EXISTS (
          SELECT 1 FROM announcement_reads r
          WHERE r.announcement_id = a.id
          AND r.user_email = $1
        ) AS is_read
      FROM announcements a
      WHERE
        a.recipients = 'all'
        OR (
          a.recipients = 'specific'
          AND $1 = ANY(a.tagged_emails)
        )
      ORDER BY a.created_at DESC
      `,
      [userEmail]
    );

    const { rows: pins } = await db.query(
      `SELECT announcement_id FROM announcement_pins WHERE user_email = $1`,
      [userEmail]
    );

    const pinnedSet = new Set(pins.map(p => p.announcement_id));

    const enriched = rows.map(a => ({
      ...a,
      is_pinned: pinnedSet.has(a.id),
    }));

    cache.setAnnouncements(userEmail, enriched);
    res.json(enriched);

  } catch (err) {
    console.error('Announcements fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/announcements
router.post('/', auth, async (req, res) => {
  try {
    const { title, content, category, recipients, tagged_emails, related_task_id } = req.body;

    if (!title || !content || !recipients) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (recipients === 'specific' && (!Array.isArray(tagged_emails) || !tagged_emails.length)) {
      return res.status(400).json({ error: 'Tagged emails required' });
    }

    await db.query(
      `
      INSERT INTO announcements
      (title, content, category, recipients, tagged_emails, related_task_id, created_by, created_by_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        title,
        content,
        category,
        recipients,
        recipients === 'specific' ? tagged_emails : null,
        related_task_id || null,
        req.user.email,
        req.user.name || req.user.email.split('@')[0],
      ]
    );

    if (recipients === 'specific' && Array.isArray(tagged_emails)) {
      tagged_emails.forEach(email => cache.delAnnouncements(email));
    }

    res.status(201).json({ success: true });

  } catch (err) {
    console.error('Announcement insert error:', err);
    res.status(500).json({ error: 'Insert failed' });
  }
});

// ── POST /api/announcements/:id/read
router.post('/:id/read', auth, async (req, res) => {
  try {
    await db.query(
      `
      INSERT INTO announcement_reads (announcement_id, user_email)
      VALUES ($1, $2)
      ON CONFLICT (announcement_id, user_email)
      DO NOTHING
      `,
      [req.params.id, req.user.email]
    );

    cache.delAnnouncements(req.user.email);
    res.json({ success: true });

  } catch (err) {
    console.error('Read error:', err);
    res.status(500).json({ error: 'Failed to mark read' });
  }
});

// ── POST /api/announcements/:id/pin
router.post('/:id/pin', auth, async (req, res) => {
  try {
    const announcementId = req.params.id;
    const userEmail      = req.user.email;

    const { rows } = await db.query(
      `
      SELECT id FROM announcement_pins
      WHERE announcement_id = $1 AND user_email = $2
      `,
      [announcementId, userEmail]
    );

    if (rows.length) {
      await db.query(
        `DELETE FROM announcement_pins WHERE announcement_id = $1 AND user_email = $2`,
        [announcementId, userEmail]
      );
      cache.delAnnouncements(userEmail);
      return res.json({ pinned: false });
    }

    await db.query(
      `INSERT INTO announcement_pins (announcement_id, user_email)
       VALUES ($1, $2)`,
      [announcementId, userEmail]
    );

    cache.delAnnouncements(userEmail);
    res.json({ pinned: true });

  } catch (err) {
    console.error('Pin error:', err);
    res.status(500).json({ error: 'Pin failed' });
  }
});

// ── DELETE /api/announcements/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const announcementId = req.params.id;
    const userEmail      = req.user.email;

    const { rows } = await db.query(
      `SELECT created_by FROM announcements WHERE id = $1`,
      [announcementId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    if (rows[0].created_by !== userEmail) {
      return res.status(403).json({ error: 'Not allowed to delete this announcement' });
    }

    await db.query(
      `DELETE FROM announcements WHERE id = $1`,
      [announcementId]
    );

    cache.delAnnouncements(userEmail);
    res.json({ success: true });

  } catch (err) {
    console.error('Delete announcement error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;