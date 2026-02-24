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
  const team = cache.getTeam();
  if (team) {
    const me = team.find(m => m.email === req.user.email);
    if (me) return res.json({ email: me.email, role: me.role, department: me.department });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('email,role,department')
    .eq('email', req.user.email)
    .single();

  if (error) return res.status(500).json(error);
  res.json(data);
});

module.exports = router;
