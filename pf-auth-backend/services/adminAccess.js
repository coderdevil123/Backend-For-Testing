const { supabase } = require('../lib/supabase');

async function requireAdmin(req, res, next) {
  try {
    const email = req.user.email;

    const { data, error } = await supabase
      .from('admin_assignments')
      .select('role_id')
      .eq('user_email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Admin check error:', error);
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!data || !data.role_id) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Now check role name separately (safer)
    const { data: role } = await supabase
      .from('roles')
      .select('name')
      .eq('id', data.role_id)
      .maybeSingle();

    if (!role || role.name !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (err) {
    console.error('Admin middleware crash:', err);
    return res.status(403).json({ error: 'Admin access required' });
  }
}

module.exports = { requireAdmin };
