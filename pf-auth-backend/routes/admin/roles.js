const express = require('express');
const { supabase } = require('../../lib/supabase');

const router = express.Router();

// GET all roles
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('name');

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch roles' });
  }

  res.json(data);
});

// CREATE role
router.post('/', async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Role name is required' });
  }

  const { error } = await supabase
    .from('roles')
    .insert({
      name,
      description: description || null,
    });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create role' });
  }

  res.json({ success: true });
});

// DELETE role
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('roles')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete role' });
  }

  res.json({ success: true });
});

module.exports = router;