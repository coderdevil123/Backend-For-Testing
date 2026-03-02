const express = require('express');
const router  = express.Router();
const auth    = require('../../middlewares/auth');
const db      = require('../../lib/db');

// ── Admin guard — rejects non-admins before any route runs ─────────────
const adminOnly = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rows } = await db.query(
      `
      SELECT is_admin
      FROM admin_assignments
      WHERE user_email = $1
      AND is_active = true
      LIMIT 1
      `,
      [req.user.email]
    );

    if (!rows.length || !rows[0].is_admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();

  } catch (err) {
    console.error('Admin guard crash:', err);
    return res.status(403).json({ error: 'Forbidden' });
  }
};


// ── Apply Middlewares ───────────────────────────────────────────────────
router.use(auth);
router.use(adminOnly);


// ── Admin Routes ────────────────────────────────────────────────────────
router.use('/me',          require('./me'));
router.use('/roles',       require('./roles'));
router.use('/departments', require('./departments'));
router.use('/assignments', require('./assignments'));

module.exports = router;