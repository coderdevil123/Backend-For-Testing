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

    // 1️⃣ Get active assignment
    const { rows: assignments } = await db.query(
      `SELECT role_id
       FROM admin_assignments
       WHERE user_email = $1
       AND is_active = true
       LIMIT 1`,
      [req.user.email]
    );

    if (!assignments.length) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const roleId = assignments[0].role_id;

    // 2️⃣ Get role name
    const { rows: roles } = await db.query(
      `SELECT name
       FROM roles
       WHERE id = $1
       LIMIT 1`,
      [roleId]
    );

    if (!roles.length || roles[0].name !== 'admin') {
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