const express = require('express');
const db = require('../../lib/db');
const cache = require('../../services/cache');
const router = express.Router();

// GET roles
router.get('/', async (req, res) => {
  try {
    const cached = cache.getRoles();
    if (cached) return res.json(cached);

    const { rows } = await db.query(
      'SELECT * FROM roles ORDER BY name ASC'
    );

    cache.setRoles(rows);
    res.json(rows);

  } catch (err) {
    console.error('Fetch roles error:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// CREATE role
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name)
      return res.status(400).json({ error: 'Role name is required' });

    await db.query(
      'INSERT INTO roles (name, description) VALUES ($1, $2)',
      [name, description || null]
    );

    cache.delRoles();
    cache.delTeam();

    res.json({ success: true });

  } catch (err) {
    console.error('Create role error:', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// DELETE role
router.delete('/:id', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM roles WHERE id = $1',
      [req.params.id]
    );

    cache.delRoles();
    cache.delTeam();

    res.json({ success: true });

  } catch (err) {
    console.error('Delete role error:', err);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

module.exports = router;