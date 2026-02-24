const express = require('express');
const router  = express.Router();
const auth    = require('../../middlewares/auth');

// ── Admin guard — rejects non-admins before any route runs ───────────────────
const adminOnly = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  // Check against admin_assignments table — NOT profiles.role
  const { supabase } = require('../../lib/supabase');
  const { data } = await supabase
    .from('admin_assignments')
    .select('role_id')
    .eq('user_email', req.user.email)
    .eq('is_active', true)
    .single();

  // Get role name
  const { data: role } = await supabase
    .from('roles')
    .select('name')
    .eq('id', data?.role_id)
    .single();

  if (role?.name !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
};

router.use(auth);         // verify JWT first
router.use(adminOnly);    // then check admin role

router.use('/me',          require('./me'));
router.use('/roles',       require('./roles'));
router.use('/departments', require('./departments'));
router.use('/assignments', require('./assignments'));

module.exports = router;