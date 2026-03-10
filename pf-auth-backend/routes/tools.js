const express = require('express');
const db      = require('../lib/db');
const auth    = require('../middlewares/auth');
const cache   = require('../services/cache');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const router = express.Router();

const requireAdmin = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `
      SELECT is_admin
      FROM admin_assignments
      WHERE user_email=$1 AND is_active=true
      `,
      [req.user.email]
    );

    if (!rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Admin only action' });
    }

    next();

  } catch (err) {
    console.error('Admin check failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Setup upload folder
const uploadDir = path.join(__dirname, '../uploads/tools');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// ── GET /api/tools
router.get('/', async (req, res) => {
  try {
    const cached = cache.getTools();
    if (cached) return res.json(cached);

    const { rows } = await db.query(`
      SELECT id, name, description, url, category,
             image, image_light, image_dark,
             tutorial_video, created_at
      FROM tools
      ORDER BY created_at DESC
    `);

    cache.setTools(rows);
    res.json(rows);

  } catch (err) {
    console.error('Fetch tools error:', err);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

// ── POST /api/tools
router.post('/', auth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, url, category, tutorial_video } = req.body;

    if (!name || !url || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let imageUrl = null;

    if (req.file) {
      imageUrl = `/uploads/tools/${req.file.filename}`;
    }

    await db.query(
      `
      INSERT INTO tools
      (name, description, url, category, tutorial_video,
       image, image_light, image_dark, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        name,
        description,
        url,
        category,
        tutorial_video,
        imageUrl,
        imageUrl,
        imageUrl,
        req.user.email
      ]
    );

    cache.delTools();
    res.json({ success: true });

  } catch (err) {
    console.error('Insert tool error:', err);
    res.status(500).json({ error: 'Failed to insert tool' });
  }
});

// ── PUT /api/tools/:id
router.put('/:id', auth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, url, tutorial_video, category } = req.body;

    let imageUrl = null;

    if (req.file) {
      imageUrl = `/uploads/tools/${req.file.filename}`;
    }

    let updateQuery = `
      UPDATE tools
      SET name=$1, description=$2, url=$3,
          tutorial_video=$4, category=$5
    `;
    let values = [name, description, url, tutorial_video, category];
    let index = 6;

    if (imageUrl) {
      updateQuery += `,
        image=$${index},
        image_light=$${index},
        image_dark=$${index}
      `;
      values.push(imageUrl);
      index++;
    }

    updateQuery += ` WHERE id=$${index}`;
    values.push(id);

    await db.query(updateQuery, values);

    cache.delTools();
    res.json({ success: true });

  } catch (err) {
    console.error('Update tool error:', err);
    res.status(500).json({ error: 'Failed to update tool' });
  }
});

// ── DELETE /api/tools/:id
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM tools WHERE id=$1`,
      [req.params.id]
    );

    cache.delTools();
    res.json({ success: true });

  } catch (err) {
    console.error('Delete tool error:', err);
    res.status(500).json({ error: 'Failed to delete tool' });
  }
});

module.exports = router;