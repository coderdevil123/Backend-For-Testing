const db    = require('../lib/db');
const cache = require('./cache');

async function requireAdmin(req, res, next) {
  try {
    const email = req.user.email;

    // ── 1️⃣ Fast path: Check team cache ─────────────────────────────
    const team = cache.getTeam();
    if (team) {
      const me = team.find(m => m.email === email);
      if (me?.role === 'admin') return next();
      return res.status(403).json({ error: 'Admin access required' });
    }

    // ── 2️⃣ Fetch active assignment ─────────────────────────────────
    const { rows: assignmentRows } = await db.query(
      `
      SELECT role_id
      FROM admin_assignments
      WHERE user_email = $1
        AND is_active = true
      LIMIT 1
      `,
      [email]
    );

    if (!assignmentRows.length) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const roleId = assignmentRows[0].role_id;

    if (!roleId) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // ── 3️⃣ Check cached roles first ────────────────────────────────
    const cachedRoles = cache.getRoles();
    if (cachedRoles) {
      const role = cachedRoles.find(r => r.id === roleId);
      if (role?.name === 'admin') return next();
      return res.status(403).json({ error: 'Admin access required' });
    }

    // ── 4️⃣ Final DB lookup ─────────────────────────────────────────
    const { rows: roleRows } = await db.query(
      `
      SELECT name
      FROM roles
      WHERE id = $1
      LIMIT 1
      `,
      [roleId]
    );

    if (roleRows.length && roleRows[0].name === 'admin') {
      return next();
    }

    return res.status(403).json({ error: 'Admin access required' });

  } catch (err) {
    console.error('Admin middleware crash:', err);
    return res.status(403).json({ error: 'Admin access required' });
  }
}

module.exports = { requireAdmin };