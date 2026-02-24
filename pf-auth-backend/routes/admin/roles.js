const express  = require('express');
const { supabase } = require('../../lib/supabase');
const cache    = require('../../services/cache');
const router   = express.Router();

router.get('/', async (req, res) => {
  try {
    const cached = cache.getRoles();

    // Bust cache if descriptions are missing from cached data
    if (cached) {
      const hasMissingDesc = cached.every(r => r.description === undefined);
      if (!hasMissingDesc) return res.json(cached);
      // else fall through to re-fetch
      cache.delRoles();
    }

    const { data, error } = await supabase
      .from('roles')
      .select('id, name, description')
      .order('name');

    if (error) return res.status(500).json({ error: error.message });
    cache.setRoles(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Role name is required' });

    const { error } = await supabase
      .from('roles')
      .insert({ name: name.trim(), description: description?.trim() || null });

    if (error) {
      console.error('Insert role error:', error);
      return res.status(500).json({ error: error.message }); // ← returns actual error message
    }

    cache.delRoles();
    cache.delTeam();
    res.json({ success: true });
  } catch (err) {
    console.error('POST roles crash:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    cache.delRoles();
    cache.delTeam();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;