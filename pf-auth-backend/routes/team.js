const express = require('express');
const db      = require('../lib/db');
const auth    = require('../middlewares/auth');
const cache   = require('../services/cache');
const router  = express.Router();

async function buildTeamResult() {
  const [profilesRes, assignmentsRes, rolesRes, departmentsRes] =
    await Promise.all([
      db.query(`
        SELECT id, email, name, avatar_url, bio, phone, mattermost, role, department
        FROM profiles
        ORDER BY name ASC
      `),
      db.query(`
        SELECT user_email, role_id, department_id, is_admin, is_visible
        FROM admin_assignments
        WHERE is_active = true
        AND (is_visible = true OR is_visible IS NULL)
      `),
      db.query(`SELECT id, name, position FROM roles ORDER BY position ASC`),
      db.query(`SELECT id, name FROM departments`)
    ]);

  const profiles     = profilesRes.rows;
  const assignments  = assignmentsRes.rows;
  const roles        = rolesRes.rows;
  const departments  = departmentsRes.rows;

  // Cache sub-data for manager route reuse
  cache.setRoles(roles);
  cache.setDepartments(departments);
  cache.setAssignments(assignments);

  const roleMap   = new Map(roles.map(r => [r.id, r.name]));
  const deptMap   = new Map(departments.map(d => [d.id, d.name]));
  const assignMap = new Map(assignments.map(a => [a.user_email, a]));

  return profiles.map(p => {
    const a = assignMap.get(p.email);
    const roleId = a?.role_id;
    const roleObj = roles.find(r => r.id === roleId);

    const roleName = a?.role_id
      ? roleMap.get(a.role_id)
      : p.role || 'member';

    const rolePosition =
      roles.find(r => r.id === a?.role_id)?.position ??
      roles.find(r => r.name === roleName)?.position ??
      999;

    return {
      ...p,
      role: roleName,
      department: a?.department_id ? deptMap.get(a.department_id) : p.department || 'general',
      is_admin: a?.is_admin || false,
      is_visible: a?.is_visible ?? true,
      role_position: rolePosition
    };
  }).filter(member => member.is_visible !== false);
}

// ── GET /api/team
router.get('/', auth, async (req, res) => {
  try {
    const cached = cache.getTeam();
    if (cached) return res.json(cached);

    const result = await buildTeamResult();
    cache.setTeam(result);
    res.json(result);

  } catch (err) {
    console.error('Team error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/team/public
router.get('/public', async (req, res) => {
  try {
    const cached = cache.getTeam();
    if (cached) return res.json(cached);

    const result = await buildTeamResult();
    cache.setTeam(result);
    res.json(result);

  } catch (err) {
    console.error('Team public error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/team/me
router.get('/me', auth, async (req, res) => {
  try {
    const email = req.user.email;

    // ── 1️⃣ Try team cache first (optimized path) ─────────────
    const team = cache.getTeam();
    if (team) {
      const me = team.find(m => m.email === email);
      if (me) {
        return res.json({
          email: me.email,
          role: me.role,
          department: me.department,
          is_admin: me.is_admin || false
        });
      }
    }

    // ── 2️⃣ Cache miss → fetch profile + assignment ───────────
    const [profileRes, assignRes] = await Promise.all([
      db.query(
        `SELECT email, role, department
         FROM profiles
         WHERE email = $1`,
        [email]
      ),
      db.query(
        `SELECT role_id, department_id, is_admin
         FROM admin_assignments
         WHERE user_email = $1
         AND is_active = true`,
        [email]
      )
    ]);

    if (!profileRes.rows.length) {
      return res.json({
        email,
        role: 'member',
        department: 'general',
        is_admin: false
      });
    }

    let role       = profileRes.rows[0].role       || 'member';
    let department = profileRes.rows[0].department || 'general';
    let is_admin   = false;

    const assignment = assignRes.rows[0];

    if (assignment) {
      is_admin = assignment.is_admin || false;

      const [roleRes, deptRes] = await Promise.all([
        assignment.role_id
          ? db.query('SELECT name FROM roles WHERE id = $1', [assignment.role_id])
          : Promise.resolve({ rows: [] }),
        assignment.department_id
          ? db.query('SELECT name FROM departments WHERE id = $1', [assignment.department_id])
          : Promise.resolve({ rows: [] })
      ]);

      if (roleRes.rows[0]?.name)  role       = roleRes.rows[0].name;
      if (deptRes.rows[0]?.name)  department = deptRes.rows[0].name;
    }

    return res.json({ email, role, department, is_admin });

  } catch (err) {
    console.error('/me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
