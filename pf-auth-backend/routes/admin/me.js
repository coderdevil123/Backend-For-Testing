const express = require('express');

const router = express.Router();

// If request reaches here → user IS admin (middleware already passed)
router.get('/', (req, res) => {
  res.json({
    isAdmin: true,
    email: req.user.email,
  });
});

module.exports = router;
