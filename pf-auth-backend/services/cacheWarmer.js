const { supabase } = require('../lib/supabase');
const cache = require('./cache');

async function warmCache() {
  console.log('[CacheWarmer] Starting cache warm-up...');
  const start = Date.now();

  try {
    // ── Fetch ALL shared data in one parallel blast ──────────────────────────
    const [profilesRes, assignmentsRes, rolesRes, departmentsRes, tasksRes, announcementsRes, toolsRes] =
      await Promise.all([
        supabase.from('profiles')
          .select('id,email,name,avatar_url,bio,phone,mattermost,role,department')
          .order('name'),

        supabase.from('admin_assignments')
          .select('user_email,role_id,department_id')
          .eq('is_active', true),

        supabase.from('roles').select('id,name'),

        supabase.from('departments').select('id,name'),

        // Warm manager tasks (page 1, unfiltered)
        supabase.from('tasks')
          .select('id,title,status,priority,created_at,assigned_to_email', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(0, 19),

        // Warm announcements for ALL recipients only (per-user cache warmed on first login)
        supabase.from('announcements')
          .select('*')
          .eq('recipients', 'all')
          .order('created_at', { ascending: false })
          .limit(50),

        supabase.from('tools').select('*').order('name'),
      ]);

    // ── Store sub-data caches ────────────────────────────────────────────────
    const roles       = rolesRes.data       || [];
    const departments = departmentsRes.data || [];
    const assignments = assignmentsRes.data || [];
    const profiles    = profilesRes.data    || [];

    cache.setRoles(roles);
    cache.setDepartments(departments);
    cache.setAssignments(assignments);

    if (toolsRes.data) cache.setTools(toolsRes.data);

    // ── Build and store team cache ───────────────────────────────────────────
    const roleMap   = new Map(roles.map(r => [r.id, r.name]));
    const deptMap   = new Map(departments.map(d => [d.id, d.name]));
    const assignMap = new Map(assignments.map(a => [a.user_email, a]));

    const team = profiles.map(p => {
      const a = assignMap.get(p.email);
      return {
        ...p,
        role:       a?.role_id       ? roleMap.get(a.role_id)       : p.role       || 'member',
        department: a?.department_id ? deptMap.get(a.department_id) : p.department || 'general',
      };
    });
    cache.setTeam(team);

    // ── Build and store manager tasks cache ──────────────────────────────────
    if (tasksRes.data) {
      const taskList = tasksRes.data;
      const enriched = taskList.map(task => {
        const a = assignMap.get(task.assigned_to_email);
        return {
          ...task,
          department: a?.department_id ? deptMap.get(a.department_id) : null,
        };
      });

      const count = tasksRes.count || 0;
      cache.setManagerTasks({
        data: enriched,
        pagination: {
          page: 1, limit: 20,
          total: count,
          pages: Math.ceil(count / 20),
          hasMore: count > 20,
        },
      });
    }

    const elapsed = Date.now() - start;
    console.log(`[CacheWarmer] ✅ Done in ${elapsed}ms — team(${team.length}), roles(${roles.length}), depts(${departments.length}), assignments(${assignments.length})`);

  } catch (err) {
    console.error('[CacheWarmer] ❌ Failed:', err.message);
    // Non-fatal — app still works, just slower on first requests
  }
}

// ── Keep Supabase awake: ping every 4 minutes ────────────────────────────────
// Free tier pauses after 5 min inactivity — this prevents that
function startKeepAlive() {
  setInterval(async () => {
    try {
      await supabase.from('roles').select('id').limit(1);
      console.log('[KeepAlive] Supabase pinged');
    } catch (e) {
      console.warn('[KeepAlive] Ping failed:', e.message);
    }
  }, 4 * 60 * 1000); // every 4 minutes
}

module.exports = { warmCache, startKeepAlive };