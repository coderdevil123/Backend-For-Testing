const express  = require('express');
const db       = require('../../lib/db');
const cache    = require('../../services/cache');
const router   = express.Router();

// ── GET /api/admin/roles ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const cached = cache.getRoles();

    // Bust cache if descriptions missing
    if (cached) {
      const hasMissingDesc = cached.every(r => r.description === undefined);
      if (!hasMissingDesc) return res.json(cached);
      cache.delRoles();
    }

    const { rows } = await db.query(
      `SELECT id, name, description
       FROM roles
       ORDER BY name ASC`
    );

    cache.setRoles(rows);
    res.json(rows);

  } catch (err) {
    console.error('GET roles error:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// ── POST /api/admin/roles ────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    await db.query(
      `INSERT INTO roles (name, description)
       VALUES ($1, $2)`,
      [name.trim(), description?.trim() || null]
    );

    cache.delRoles();
    cache.delTeam();

    res.json({ success: true });

  } catch (err) {
    console.error('Insert role error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/roles/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.query(
      `DELETE FROM roles
       WHERE id = $1`,
      [req.params.id]
    );

    cache.delRoles();
    cache.delTeam();

    res.json({ success: true });

  } catch (err) {
    console.error('Delete role error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;