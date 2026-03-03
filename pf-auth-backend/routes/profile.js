const express = require('express');
const db      = require('../lib/db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const auth    = require('../middlewares/auth');
const axios   = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

//setup of voice recorder
const voiceDir = path.join(__dirname, '../uploads/voice');

if (!fs.existsSync(voiceDir)) {
  fs.mkdirSync(voiceDir, { recursive: true });
}

const voiceStorage = multer.diskStorage({
  destination: voiceDir,
  filename: (req, file, cb) => {
    const email = req.user.email;
    cb(null, `${email}.webm`);
  }
});

const uploadVoice = multer({ storage: voiceStorage });

// ── Setup avatar upload directory
const avatarDir = path.join(__dirname, '../uploads/avatars');

if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: avatarDir,
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    const uniqueName = `${req.user.email}-${uuidv4()}.${ext}`;
    cb(null, uniqueName);
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

    // 🔥 STEP 1: Get old avatar path from DB
    const { rows } = await db.query(
      `SELECT avatar_url FROM profiles WHERE email=$1`,
      [email]
    );

    if (rows[0]?.avatar_url) {
      const oldPath = path.join(__dirname, '..', rows[0].avatar_url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // 🔥 STEP 2: Save new path
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

/* ── POST /api/profile/voice */
router.post('/voice', auth, uploadVoice.single('voice'), async (req, res) => {
  try {
    const { email, name } = req.user;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No voice file uploaded' });
    }

    const voicePath = `/uploads/voice/${file.filename}`;
    const now = new Date();

    // 🔹 STEP 1 — Save locally and mark NOT verified yet
    await db.query(
      `UPDATE profiles 
       SET voice_sample_url=$1,
           voice_sample_uploaded_at=$2,
           status=FALSE
       WHERE email=$3`,
      [voicePath, now, email]
    );

    // 🔹 STEP 2 — Send to enrollment service
    const form = new FormData();
    form.append('audio', fs.createReadStream(file.path));
    form.append('email', email);
    form.append('user_name', name);

    try {
      const enrollmentResponse = await axios.post(
        'http://10.10.10.7:8000/api/enroll/voice',
        form,
        {
          headers: form.getHeaders(),
          timeout: 15000,
        }
      );

      // 🔥 Only now mark verified
      await db.query(
        `UPDATE profiles SET status=TRUE WHERE email=$1`,
        [email]
      );

    } catch (externalError) {
      console.error("Enrollment API failed:");
      console.error("Status:", externalError.response?.status);
      console.error("Data:", externalError.response?.data);
      console.error("Message:", externalError.message);

      // Already FALSE, no need to change again
      // Create announcement entry
      await db.query(
        `
        INSERT INTO announcements (title, content, category, created_at)
        VALUES ($1,$2,$3,NOW())
        `,
        [
          'Voice Verification Failed',
          `Voice enrollment failed for ${email}. Reason: ${externalError.response?.data?.detail || externalError.message}`,
          'Security'
        ]
      );

      return res.status(500).json({
        error: externalError.response?.data?.detail || 'Voice enrollment failed'
      });
    }

    res.json({
      voice_sample_url: voicePath,
      voice_sample_uploaded_at: now
    });

  } catch (err) {
    console.error('Voice upload error:', err);
    res.status(500).json({ error: 'Voice upload failed' });
  }
});

/* ── DELETE /api/profile/voice */
router.delete('/voice', auth, async (req, res) => {
  try {
    const { email } = req.user;

    const { rows } = await db.query(
      `SELECT voice_sample_url FROM profiles WHERE email=$1`,
      [email]
    );

    if (rows[0]?.voice_sample_url) {
      const filePath = path.join(__dirname, '..', rows[0].voice_sample_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await db.query(
      `UPDATE profiles 
       SET voice_sample_url=NULL,
           voice_sample_uploaded_at=NULL,
           status=FALSE
       WHERE email=$1`,
      [email]
    );

    res.json({ success: true });

  } catch (err) {
    console.error('Voice delete error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;