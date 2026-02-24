const { supabase } = require('../lib/supabase');
const cache = require('./cache');

async function requireAdmin(req, res, next) {
  try {
    const email = req.user.email;

    // ── Check team cache first (already has enriched roles) — zero DB cost ───
    const team = cache.getTeam();
    if (team) {
      const me = team.find(m => m.email === email);
      if (me?.role === 'admin') return next();
      return res.status(403).json({ error: 'Admin access required' });
    }

    // ── Cache miss: fetch assignment + role name in parallel ─────────────────
    const { data: assignment } = await supabase
      .from('admin_assignments')
      .select('role_id')
      .eq('user_email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (!assignment?.role_id) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // ── Check cached roles list before hitting DB ────────────────────────────
    const cachedRoles = cache.getRoles();
    if (cachedRoles) {
      const role = cachedRoles.find(r => r.id === assignment.role_id);
      if (role?.name === 'admin') return next();
      return res.status(403).json({ error: 'Admin access required' });
    }

    // ── Last resort: DB lookup ───────────────────────────────────────────────
    const { data: role } = await supabase
      .from('roles')
      .select('name')
      .eq('id', assignment.role_id)
      .maybeSingle();

    if (role?.name === 'admin') return next();
    return res.status(403).json({ error: 'Admin access required' });

  } catch (err) {
    console.error('Admin middleware crash:', err);
    return res.status(403).json({ error: 'Admin access required' });
  }
}

module.exports = { requireAdmin };