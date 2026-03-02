const express = require('express');
const db = require('../lib/db');
const auth = require('../middlewares/auth');

const router = express.Router();

router.patch('/update-role', auth, async (req, res) => {
  try {
    // 🔐 ADMIN CHECK (better than req.user.role)
    const { rows: adminCheck } = await db.query(
      `
      SELECT is_admin
      FROM admin_assignments
      WHERE user_email = $1
      AND is_active = true
      LIMIT 1
      `,
      [req.user.email]
    );

    if (!adminCheck.length || !adminCheck[0].is_admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { email, role, department } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const ALLOWED_ROLES = ['admin', 'team_lead', 'intern', 'member'];
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // ✅ ROLE → DEPARTMENT RULES
    let finalDepartment = 'general';

    if (role === 'admin') {
      finalDepartment = 'leadership';
    } else if (['team_lead', 'intern'].includes(role)) {
      finalDepartment = department || 'general';
    }

    // 🔥 Single atomic update
    await db.query(
      `UPDATE profiles
       SET role = $1,
           department = $2
       WHERE email = $3`,
      [role.toLowerCase(), finalDepartment, email]
    );

    res.json({ success: true });

  } catch (err) {
    console.error('Role update crash:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

module.exports = router;