const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const userRoutes = require('./users.routes');
const collegeRoutes = require('./colleges.routes');
const academicRoutes = require('./academic.routes');
const studentRoutes = require('./students.routes');
const teacherRoutes = require('./teachers.routes');
const financeRoutes = require('./finance.routes');
const collegeAttendanceCriteriaRoutes = require('./collegeAttendanceCriteria.routes');
const analyticsRoutes = require('./analytics.routes');
const uploadRoutes = require('./upload.routes');
const imageRoutes = require('./image.routes');
const roleRoutes = require('./roles.routes');
const env = require('../config/env');

const router = express.Router();

// Image route first (no auth) so /image/folder/file.jpg is not caught by /:id
router.use(imageRoutes);
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/colleges', collegeRoutes);
router.use('/academic', academicRoutes);
router.use('/students', studentRoutes);
router.use('/teachers', teacherRoutes);
router.use('/finance', financeRoutes);
router.use('/attendance-criteria', collegeAttendanceCriteriaRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/upload', uploadRoutes);

const mountRoutes = (app) => {
  app.use(env.apiPrefix, router);
};

module.exports = mountRoutes;

