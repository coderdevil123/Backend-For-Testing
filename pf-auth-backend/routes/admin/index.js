const express = require('express');
const { requireAdmin } = require('../../services/adminAccess');
const auth = require('../middlewares/auth');

const router = express.Router();
router.use(auth); // 🔐 ALL admin routes require authentication
router.use(requireAdmin); // 🔒 ALL admin routes protected

router.use('/roles', require('./roles'));
router.use('/departments', require('./departments'));
router.use('/assignments', require('./assignments'));

module.exports = router;
