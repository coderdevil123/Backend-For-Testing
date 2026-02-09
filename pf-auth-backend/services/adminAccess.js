const { supabase } = require('../lib/supabase');

async function getAdminContext(email) {
  const { data, error } = await supabase
    .from('admin_assignments')
    .select(`
      role:roles(name, level),
      department:departments(name),
      is_active
    `)
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('Admin access lookup failed:', error);
    return null;
  }

  if (!data) return null;

  return {
    role: data.role?.name,
    roleLevel: data.role?.level ?? 0,
    department: data.department?.name,
  };
}

async function requireAdmin(req, res, next) {
  const adminContext = await getAdminContext(req.user.email);

  if (!adminContext) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.admin = adminContext;
  next();
}

module.exports = {
  getAdminContext,
  requireAdmin,
};
