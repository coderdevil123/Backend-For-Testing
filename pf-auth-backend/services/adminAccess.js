const { supabase } = require('../lib/supabase');

async function requireAdmin(req, res, next) {
  const email = req.user.email;

  const { data, error } = await supabase
    .from('admin_assignments')
    .select(`
      is_active,
      roles ( name )
    `)
    .eq('user_email', email)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Admin check failed' });
  }

  if (!data || data.roles?.name !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

module.exports = { requireAdmin };
