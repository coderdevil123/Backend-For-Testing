const express = require('express');
const db      = require('../../lib/db');
const cache   = require('../../services/cache');
const router  = express.Router();


// ── GET /api/admin/assignments ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const cached = cache.getAssignments();
    if (cached && cached[0]?.name !== undefined) {
      return res.json(cached);
    }

    const [profilesResult, assignmentsResult] = await Promise.all([
      db.query(
        `SELECT email, name
         FROM profiles
         ORDER BY name ASC`
      ),
      db.query(
        `SELECT user_email, role_id, department_id, is_admin, is_visible
         FROM admin_assignments
         WHERE is_active = true`
      )
    ]);

    const profiles    = profilesResult.rows;
    const assignments = assignmentsResult.rows;

    const map = new Map(
      assignments.map(a => [a.user_email, a])
    );

    const result = profiles.map(p => ({
      email: p.email,
      name:  p.name,
      role_id: map.get(p.email)?.role_id ?? null,
      department_id: map.get(p.email)?.department_id ?? null,
      is_admin: map.get(p.email)?.is_admin ?? false,
      is_visible: map.get(p.email)?.is_visible ?? true,
    }));

    cache.setAssignments(result);
    res.json(result);

  } catch (err) {
    console.error('GET assignments error:', err);
    res.status(500).json({ error: 'Failed to load assignments' });
  }
});


// ── PATCH /api/admin/assignments ─────────────────────────────────────
router.patch('/', async (req, res) => {
  try {
    const { email, role_id, department_id, is_admin, is_visible } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    await db.query(
      `
      INSERT INTO admin_assignments
      (user_email, role_id, department_id, is_admin, is_visible, assigned_by, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      ON CONFLICT (user_email)
      DO UPDATE SET
        role_id       = EXCLUDED.role_id,
        department_id = EXCLUDED.department_id,
        is_admin      = EXCLUDED.is_admin,
        is_visible    = EXCLUDED.is_visible,
        assigned_by   = EXCLUDED.assigned_by,
        is_active     = true
      `,
      [
        email,
        role_id || null,
        department_id || null,
        is_admin ?? false,          
        is_visible ?? true,         
        req.user.email 
      ]
    );

    cache.delAssignments();
    cache.delTeam();
    cache.delManagerTasks();

    res.json({ success: true });

  } catch (err) {
    console.error('PATCH assignment error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ── DELETE /api/admin/assignments/:email ─────────────────────────────
router.delete('/:email', async (req, res) => {
  try {
    await db.query(
      `UPDATE admin_assignments
       SET is_active = false
       WHERE user_email = $1`,
      [req.params.email]
    );

    cache.delAssignments();
    cache.delTeam();
    cache.delManagerTasks();

    res.json({ success: true });

  } catch (err) {
    console.error('DELETE assignment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;