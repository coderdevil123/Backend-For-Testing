// const express = require('express');
// const { supabase } = require('../lib/supabase');
// const auth = require('../middlewares/auth');

// const router = express.Router();

// // router.get('/', auth, async (req, res) => {
// //   // 1️⃣ Get profiles
// //   const { data: profiles, error: pErr } = await supabase
// //     .from('profiles')
// //     .select(`
// //       id,
// //       email,
// //       name,
// //       avatar_url,
// //       bio,
// //       phone,
// //       mattermost,
// //       role,
// //       department
// //     `)
// //     .order('name');

// //   if (pErr) {
// //     console.error(pErr);
// //     return res.status(500).json({ error: 'Failed to load profiles' });
// //   }

// //   // 2️⃣ Get active admin assignments
// //   const { data: assignments, error: aErr } = await supabase
// //     .from('admin_assignments')
// //     .select('user_email, role_id, department_id')
// //     .eq('is_active', true);

// //   if (aErr) {
// //     console.error(aErr);
// //     return res.status(500).json({ error: 'Failed to load assignments' });
// //   }

// //   // 3️⃣ Resolve role + department names
// //   const { data: roles } = await supabase
// //     .from('roles')
// //     .select('id, name');

// //   const roleMap = new Map(roles.map(r => [r.id, r.name]));

// //   const { data: departments } = await supabase
// //     .from('departments')
// //     .select('id, name');
  
// //   const deptMap = new Map(departments.map(d => [d.id, d.name]));

// //   const assignMap = new Map(assignments.map(a => [a.user_email, a]));

// //   // 4️⃣ Merge (ADMIN ASSIGNMENT OVERRIDES PROFILE)
// //   const result = [];

// //   // First: process all profiles (existing behavior)
// //   profiles.forEach(p => {
// //     const a = assignMap.get(p.email);

// //     result.push({
// //       ...p,
// //       role: a?.role_id ? roleMap.get(a.role_id) : p.role || 'member',
// //       department: a?.department_id
// //         ? deptMap.get(a.department_id)
// //         : p.department || 'general',
// //     });
// //   });

// //   // Second: add users who exist in admin_assignments but NOT in profiles
// //   assignments.forEach(a => {
// //     const alreadyExists = profiles.find(p => p.email === a.user_email);

// //     if (!alreadyExists) {
// //       result.push({
// //         id: null,
// //         email: a.user_email,
// //         name: a.user_email, // fallback to email
// //         avatar_url: null,
// //         bio: null,
// //         phone: null,
// //         mattermost: null,
// //         role: roleMap.get(a.role_id) || 'member',
// //         department: deptMap.get(a.department_id) || 'general',
// //       });
// //     }
// //   });

// //   res.json(result);
// // });

// router.get('/', auth, async (req, res) => {
//   try {
//     const [profilesRes, assignmentsRes, rolesRes, departmentsRes] =
//       await Promise.all([
//         supabase.from('profiles')
//           .select(`
//             id,email,name,avatar_url,bio,phone,mattermost,role,department
//           `)
//           .order('name'),

//         supabase.from('admin_assignments')
//           .select('user_email, role_id, department_id')
//           .eq('is_active', true),

//         supabase.from('roles').select('id,name'),

//         supabase.from('departments').select('id,name')
//       ]);

//     if (
//       profilesRes.error ||
//       assignmentsRes.error ||
//       rolesRes.error ||
//       departmentsRes.error
//     ) {
//       return res.status(500).json({ error: 'Failed to load team data' });
//     }

//     const roleMap = new Map(
//       rolesRes.data.map(r => [r.id, r.name])
//     );

//     const deptMap = new Map(
//       departmentsRes.data.map(d => [d.id, d.name])
//     );

//     const assignMap = new Map(
//       assignmentsRes.data.map(a => [a.user_email, a])
//     );

//     const result = profilesRes.data.map(p => {
//       const a = assignMap.get(p.email);

//       return {
//         ...p,
//         role: a?.role_id
//           ? roleMap.get(a.role_id)
//           : p.role || 'member',
//         department: a?.department_id
//           ? deptMap.get(a.department_id)
//           : p.department || 'general',
//       };
//     });

//     res.json(result);

//   } catch (err) {
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// router.get('/public', async (req, res) => {
//   const { data: profiles } = await supabase
//     .from('profiles')
//     .select(`
//       id,
//       email,
//       name,
//       avatar_url,
//       bio,
//       phone,
//       mattermost,
//       role,
//       department
//     `)
//     .order('name');

//   const { data: assignments } = await supabase
//     .from('admin_assignments')
//     .select('user_email, role_id, department_id')
//     .eq('is_active', true);

//   const { data: roles } = await supabase
//     .from('roles')
//     .select('id, name');

//   const roleMap = new Map(roles.map(r => [r.id, r.name]));

//   const { data: departments } = await supabase
//     .from('departments')
//     .select('id, name');
  
//   const deptMap = new Map(departments.map(d => [d.id, d.name]));
//   const assignMap = new Map(assignments.map(a => [a.user_email, a]));

//   const result = profiles.map(p => {
//     const a = assignMap.get(p.email);
//     return {
//       ...p,
//       role: a?.role_id ? roleMap.get(a.role_id) : p.role || 'member',
//       department: a?.department_id
//       ? deptMap.get(a.department_id)
//       : p.department || 'general',
//     };
//   });

//   res.json(result);
// });


// router.get('/me', auth, async (req, res) => {
//   const { data, error } = await supabase
//     .from('profiles')
//     .select('email, role, department')
//     .eq('email', req.user.email)
//     .single();

//   if (error) {
//     return res.status(500).json(error);
//   }

//   res.json(data);
// });

// module.exports = router;

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
