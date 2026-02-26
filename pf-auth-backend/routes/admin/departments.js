const express = require('express');
const db      = require('../../lib/db');
const auth    = require('../../middlewares/auth');
const cache   = require('../../services/cache');
const router  = express.Router();


// ── GET /api/admin/departments ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const cached = cache.getDepartments();
    if (cached) return res.json(cached);

    const { rows } = await db.query(
      `SELECT id, name
       FROM departments
       ORDER BY name ASC`
    );

    cache.setDepartments(rows);
    res.json(rows);

  } catch (err) {
    console.error('GET departments error:', err);
    res.status(500).json({ error: 'Failed to load departments' });
  }
});


// ── POST /api/admin/departments ──────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing department name' });
    }

    await db.query(
      `INSERT INTO departments (name)
       VALUES ($1)`,
      [name.trim()]
    );

    cache.delDepartments();
    cache.delTeam();

    res.json({ success: true });

  } catch (err) {
    console.error('POST department error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ── DELETE /api/admin/departments/:id ─────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM departments
       WHERE id = $1`,
      [req.params.id]
    );

    cache.delDepartments();
    cache.delTeam();

    res.json({ success: true });

  } catch (err) {
    console.error('DELETE department error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;