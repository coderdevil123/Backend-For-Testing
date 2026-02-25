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
        SELECT user_email, role_id, department_id
        FROM admin_assignments
        WHERE is_active = true
      `),
      db.query(`SELECT id, name FROM roles`),
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
    return {
      ...p,
      role:       a?.role_id       ? roleMap.get(a.role_id)       : p.role       || 'member',
      department: a?.department_id ? deptMap.get(a.department_id) : p.department || 'general',
    };
  });
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

    // Try team cache first
    const team = cache.getTeam();
    if (team) {
      const me = team.find(m => m.email === email);
      if (me) {
        return res.json({
          email: me.email,
          role: me.role,
          department: me.department
        });
      }
    }

    // Fetch profile + assignment
    const [profileRes, assignRes] = await Promise.all([
      db.query(
        `SELECT email, role, department
         FROM profiles
         WHERE email = $1`,
        [email]
      ),
      db.query(
        `SELECT role_id, department_id
         FROM admin_assignments
         WHERE user_email = $1
         AND is_active = true`,
        [email]
      )
    ]);

    if (!profileRes.rows.length) {
      return res.status(500).json({ error: 'Profile not found' });
    }

    let role       = profileRes.rows[0].role       || 'member';
    let department = profileRes.rows[0].department || 'general';

    const assignment = assignRes.rows[0];

    if (assignment) {
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

    res.json({ email, role, department });

  } catch (err) {
    console.error('/me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;