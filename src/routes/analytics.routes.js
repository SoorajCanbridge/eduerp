const express = require('express');
const { param, query } = require('express-validator');
const {
  getCourseStudentAnalytics,
  getSummaryByPeriod,
  rebuildTotal
} = require('../controllers/analytics.controller');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

router.use(auth);

router.get(
  '/',
  [
    query('collegeId').optional().isMongoId().withMessage('collegeId must be a valid Mongo ID'),
    query('periodType')
      .optional()
      .isIn(['day', 'week', 'month', 'year', 'total'])
      .withMessage('periodType must be day, week, month, year, or total'),
    query('periodKey').optional().trim(),
    query('from').optional().isISO8601().withMessage('from must be a valid date'),
    query('to').optional().isISO8601().withMessage('to must be a valid date')
  ],
  requirePermission('finance', 'view'),
  getCourseStudentAnalytics
);

router.get(
  '/summary',
  [
    query('collegeId').optional().isMongoId().withMessage('collegeId must be a valid Mongo ID'),
    query('periodType')
      .optional()
      .isIn(['day', 'week', 'month', 'year', 'total'])
      .withMessage('periodType must be day, week, month, year, or total')
  ],
  requirePermission('finance', 'view'),
  getSummaryByPeriod
);

router.post(
  '/rebuild-total',
  requirePermission('finance', 'edit'),
  rebuildTotal
);
router.post(
  '/rebuild-total/:collegeId',
  param('collegeId').isMongoId().withMessage('collegeId must be a valid Mongo ID'),
  requirePermission('finance', 'edit'),
  rebuildTotal
);

module.exports = router;
