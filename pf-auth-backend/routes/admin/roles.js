const express = require('express');
const { supabase } = require('../../lib/db');
const cache = require('../../services/cache');
const router = express.Router();

router.get('/', async (req, res) => {
  const cached = cache.getRoles();
  if (cached) return res.json(cached);

  const { rows } = await db.query(
    'SELECT * FROM roles ORDER BY name ASC'
  );
  const data = rows;

  if (error) return res.status(500).json({ error: 'Failed to fetch roles' });

  cache.setRoles(data);
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Role name is required' });

    const { error } = await db.query(
      'INSERT INTO roles (name, description) VALUES ($1, $2)',
      [name, description || null]
    );

  if (error) return res.status(500).json({ error: 'Failed to create role' });

  cache.delRoles();
  cache.delTeam(); // team data includes role names
  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  const { error } = await db.query(
    'DELETE FROM roles WHERE id = $1',
    [req.params.id]
  );
  if (error) return res.status(500).json({ error: 'Failed to delete role' });

  cache.delRoles();
  cache.delTeam();
  res.json({ success: true });
});

module.exports = router;
