const express = require('express');
const auth = require('../../middlewares/auth');
const { requireAdmin } = require('../../services/adminAccess');

const router = express.Router();

router.use(auth);         // 🔑 req.user
router.use(requireAdmin); // 🔒 admin only

router.use('/roles', require('./roles'));
router.use('/departments', require('./departments'));
router.use('/assignments', require('./assignments'));

module.exports = router;
