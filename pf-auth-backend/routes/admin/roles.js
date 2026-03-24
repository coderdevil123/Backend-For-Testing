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
      `SELECT id, name, description, position
       FROM roles
       ORDER BY position ASC, name ASC`
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
    const { name, description, position } = req.body;
    const existing = await db.query(
      `SELECT id FROM roles WHERE position = $1`,
      [position]
      );

      if (existing.rows.length) {
        return res.status(400).json({
          error: "This rank is already given to another role"
        });
    }

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    await db.query(
      `INSERT INTO roles (name, description, position)
       VALUES ($1, $2, $3)`,
      [name.trim(), description?.trim() || null, position || 999]
    );

    cache.delRoles();
    cache.delTeam();

    res.json({ success: true });

  } catch (err) {
    console.error('Insert role error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/roles/reorder ─────────────────────────────
router.patch('/reorder', async (req, res) => {
  try {
    const { roles } = req.body;

    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: "Invalid roles payload" });
    }

    // Build a single atomic UPDATE query using a CASE statement.
    // This updates all positions simultaneously, avoiding UNIQUE constraint collisions.
    let query = `UPDATE roles SET position = CASE id `;
    const values = [];
    const ids = [];

    roles.forEach((role, index) => {
      // Push ID and Position into the values array
      values.push(role.id, role.position);
      
      const idPlaceholder = `$${index * 2 + 1}`;
      const posPlaceholder = `$${index * 2 + 2}`;
      
      // Construct the CASE logic: WHEN id = $1 THEN $2
      query += `WHEN ${idPlaceholder} THEN ${posPlaceholder}::int `;
      ids.push(idPlaceholder);
    });

    query += `END WHERE id IN (${ids.join(', ')})`;

    // Execute the single query
    await db.query(query, values);

    // Clear caches so the frontend gets the fresh order on reload
    cache.delRoles();
    cache.delTeam();

    res.json({ success: true, message: "Roles reordered successfully" });

  } catch (err) {
    console.error("Reorder roles error:", err);
    res.status(500).json({ error: "Failed to reorder roles" });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { name, description, position } = req.body;

    const existing = await db.query(
      `SELECT id FROM roles WHERE position=$1 AND id != $2`,
      [position, req.params.id]
    );

    if (existing.rows.length) {
      return res.status(400).json({
        error: "This rank is already given to another role"
      });
    }

    await db.query(
      `UPDATE roles
       SET name=$1, description=$2, position=$3
       WHERE id=$4`,
      [name, description || null, position || 999, req.params.id]
    );

    cache.delRoles();
    cache.delTeam();

    res.json({ success: true });

  } catch (err) {
    console.error("Update role error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/roles/:id ───────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { name, description, position } = req.body;

    const existing = await db.query(
      `SELECT id FROM roles
       WHERE position = $1
       AND id != $2`,
      [position, req.params.id]
    );

    if (existing.rows.length) {
      return res.status(400).json({
        error: "This rank is already given to another role"
      });
    }

    await db.query(
      `
      UPDATE roles
      SET name = $1,
          description = $2,
          position = $3
      WHERE id = $4
      `,
      [name, description, position, req.params.id]
    );

    cache.delRoles();
    cache.delTeam();

    res.json({ success: true });

  } catch (err) {
    console.error('Update role error:', err);
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