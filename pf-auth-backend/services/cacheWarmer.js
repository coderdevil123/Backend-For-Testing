const { supabase } = require('../lib/supabase');
const cache = require('./cache');

async function warmCache() {
  console.log('[CacheWarmer] Warming up...');
  const t = Date.now();

  try {
    const [profilesRes, assignmentsRes, rolesRes, deptsRes, tasksRes, toolsRes] =
      await Promise.all([
        supabase.from('profiles')
          .select('id,email,name,avatar_url,bio,phone,mattermost,role,department')
          .order('name'),
        supabase.from('admin_assignments')
          .select('user_email,role_id,department_id')
          .eq('is_active', true),
        supabase.from('roles').select('id,name'),
        supabase.from('departments').select('id,name'),
        supabase.from('tasks')
          .select('id,title,status,priority,created_at,assigned_to_email', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(0, 19),
        supabase.from('tools').select('*').order('name').catch(() => ({ data: null })),
      ]);

    const roles       = rolesRes.data       || [];
    const departments = deptsRes.data       || [];
    const assignments = assignmentsRes.data || [];
    const profiles    = profilesRes.data    || [];

    // Only call cache methods that exist
    if (typeof cache.setRoles       === 'function') cache.setRoles(roles);
    if (typeof cache.setDepartments === 'function') cache.setDepartments(departments);
    if (typeof cache.setAssignments === 'function') cache.setAssignments(assignments);
    if (typeof cache.setTools       === 'function' && toolsRes.data) cache.setTools(toolsRes.data);

    // Build + store team
    const roleMap   = new Map(roles.map(r       => [r.id, r.name]));
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
    if (typeof cache.setTeam === 'function') cache.setTeam(team);

    // Build + store manager tasks page 1
    if (tasksRes.data && typeof cache.setManagerTasks === 'function') {
      const enriched = tasksRes.data.map(task => {
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
          total:   count,
          pages:   Math.ceil(count / 20),
          hasMore: count > 20,
        },
      });
    }

    console.log(`[CacheWarmer] ✅ Done in ${Date.now() - t}ms — ${profiles.length} users, ${(tasksRes.data || []).length} tasks`);

  } catch (err) {
    // Log but DON'T crash the server
    console.error('[CacheWarmer] ❌ Error (non-fatal):', err.message);
  }
}

function startKeepAlive() {
  setInterval(async () => {
    try {
      await supabase.from('roles').select('id').limit(1);
      console.log('[KeepAlive] ping ok');
    } catch (_) {}
  }, 4 * 60 * 1000);
  console.log('[KeepAlive] Started');
}

module.exports = { warmCache, startKeepAlive };