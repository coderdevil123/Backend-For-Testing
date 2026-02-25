const express = require('express');
const db      = require('../lib/db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const auth    = require('../middlewares/auth');

// ── Setup avatar upload directory
const avatarDir = path.join(__dirname, '../uploads/avatars');

if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: avatarDir,
  filename: (req, file, cb) => {
    const email = req.user.email;
    const ext = file.originalname.split('.').pop();
    cb(null, `${email}.${ext}`);
  }
});

const upload = multer({ storage });

/* ── GET /api/profile */
router.get('/', auth, async (req, res) => {
  try {
    const { email } = req.user;

    const { rows } = await db.query(
      `SELECT * FROM profiles WHERE email = $1`,
      [email]
    );

    if (!rows.length) {
      return res.status(500).json({ error: 'Profile not found' });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error('Fetch profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ── PUT /api/profile */
router.put('/', auth, async (req, res) => {
  try {
    const { email } = req.user;
    const { name, phone, bio, location, avatar_url, mattermost } = req.body || {};

    await db.query(
      `
      UPDATE profiles
      SET name=$1,
          phone=$2,
          bio=$3,
          location=$4,
          avatar_url=$5,
          mattermost=$6
      WHERE email=$7
      `,
      [name, phone, bio, location, avatar_url, mattermost, email]
    );

    const { rows } = await db.query(
      `SELECT * FROM profiles WHERE email=$1`,
      [email]
    );

    res.json(rows[0]);

  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

/* ── POST /api/profile/avatar */
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    const { email } = req.user;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const avatarPath = `/uploads/avatars/${file.filename}`;

    await db.query(
      `UPDATE profiles SET avatar_url=$1 WHERE email=$2`,
      [avatarPath, email]
    );

    res.json({ avatar_url: avatarPath });

  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Avatar upload failed' });
  }
});

module.exports = router;