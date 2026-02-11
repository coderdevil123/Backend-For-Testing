const express = require('express');
const { requireAdmin } = require('../../services/adminAccess');

const router = express.Router();

// If request reaches here → user IS admin
router.get('/me', requireAdmin, (req, res) => {
  res.json({ isAdmin: true });
});

module.exports = router;
