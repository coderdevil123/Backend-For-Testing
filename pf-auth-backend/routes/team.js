const express = require('express');
const { supabase } = require('../lib/supabase');
const auth  = require('../middlewares/auth');
const cache = require('../services/cache');
const router = express.Router();

async function buildTeamResult() {
  const [profilesRes, assignmentsRes, rolesRes, departmentsRes] = await Promise.all([
    supabase.from('profiles')
      .select('id,email,name,avatar_url,bio,phone,mattermost,role,department')
      .order('name'),
    supabase.from('admin_assignments')
      .select('user_email,role_id,department_id')
      .eq('is_active', true),
    supabase.from('roles').select('id,name'),
    supabase.from('departments').select('id,name'),
  ]);

  if (profilesRes.error || assignmentsRes.error || rolesRes.error || departmentsRes.error) {
    throw new Error('Failed to load team data');
  }

  // Cache sub-data so manager route can reuse it
  cache.setRoles(rolesRes.data);
  cache.setDepartments(departmentsRes.data);
  cache.setAssignments(assignmentsRes.data);

  const roleMap   = new Map(rolesRes.data.map(r => [r.id, r.name]));
  const deptMap   = new Map(departmentsRes.data.map(d => [d.id, d.name]));
  const assignMap = new Map(assignmentsRes.data.map(a => [a.user_email, a]));

  return profilesRes.data.map(p => {
    const a = assignMap.get(p.email);
    return {
      ...p,
      role:       a?.role_id       ? roleMap.get(a.role_id)       : p.role       || 'member',
      department: a?.department_id ? deptMap.get(a.department_id) : p.department || 'general',
    };
  });
}

// GET /api/team
router.get('/', auth, async (req, res) => {
  try {
    const cached = cache.getTeam();
    if (cached) return res.json(cached);

    const result = await buildTeamResult();
    cache.setTeam(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/team/public
router.get('/public', async (req, res) => {
  try {
    const cached = cache.getTeam();
    if (cached) return res.json(cached);

    const result = await buildTeamResult();
    cache.setTeam(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/team/me
router.get('/me', auth, async (req, res) => {
  try {
    // ── Check team cache first (has enriched roles) ──────────────────────────
    const team = cache.getTeam();
    if (team) {
      const me = team.find(m => m.email === req.user.email);
      if (me) return res.json({ email: me.email, role: me.role, department: me.department });
    }

    // ── Cache miss: fetch profile + assignment in parallel ───────────────────
    const [profileRes, assignRes] = await Promise.all([
      supabase.from('profiles')
        .select('email,role,department')
        .eq('email', req.user.email)
        .single(),
      supabase.from('admin_assignments')
        .select('role_id,department_id')
        .eq('user_email', req.user.email)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    if (profileRes.error) return res.status(500).json({ error: 'Profile not found' });

    let role       = profileRes.data?.role       || 'member';
    let department = profileRes.data?.department || 'general';

    // ── If assignment exists, resolve actual role/dept names from IDs ────────
    if (assignRes.data) {
      const [roleRes, deptRes] = await Promise.all([
        assignRes.data.role_id
          ? supabase.from('roles').select('name').eq('id', assignRes.data.role_id).single()
          : Promise.resolve({ data: null }),
        assignRes.data.department_id
          ? supabase.from('departments').select('name').eq('id', assignRes.data.department_id).single()
          : Promise.resolve({ data: null }),
      ]);
      if (roleRes.data?.name)  role       = roleRes.data.name;
      if (deptRes.data?.name)  department = deptRes.data.name;
    }

    res.json({ email: req.user.email, role, department });

  } catch (err) {
    console.error('/me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;
