const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getCollegeAttendanceCriteria,
  upsertCollegeAttendanceCriteria,
  updateCriteriaSection,
  deleteCollegeAttendanceCriteria,
  getOrCreateDefaultCriteria,
  validateLocation,
  checkWorkingDay,
  getExpectedTimes
} = require('../controllers/collegeAttendanceCriteria.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

// Get attendance criteria for a college
router.get(
  '/college/:collegeId',
  [
    param('collegeId')
      .isMongoId()
      .withMessage('Valid college ID is required')
  ],
  getCollegeAttendanceCriteria
);

// Get attendance criteria for current user's college
router.get(
  '/college',
  getCollegeAttendanceCriteria
);

// Create or update attendance criteria
router.post(
  '/college/:collegeId',
  [
    param('collegeId')
      .isMongoId()
      .withMessage('Valid college ID is required')
  ],
  upsertCollegeAttendanceCriteria
);

// Create or update attendance criteria for current user's college
router.post(
  '/college',
  upsertCollegeAttendanceCriteria
);

// Update specific section of criteria
router.patch(
  '/college/:collegeId/section',
  [
    param('collegeId')
      .isMongoId()
      .withMessage('Valid college ID is required'),
    body('section')
      .notEmpty()
      .withMessage('Section name is required')
      .isIn([
        'timeSettings',
        'toleranceSettings',
        'attendanceMethods',
        'locationSettings',
        'workingDays',
        'overtimeSettings',
        'statusRules',
        'leaveSettings',
        'approvalWorkflow',
        'regularizationSettings',
        'notificationSettings',
        'advancedSettings'
      ])
      .withMessage('Invalid section name'),
    body('data')
      .notEmpty()
      .withMessage('Section data is required')
      .isObject()
      .withMessage('Section data must be an object')
  ],
  updateCriteriaSection
);

// Get or create default criteria
router.get(
  '/college/:collegeId/default',
  [
    param('collegeId')
      .isMongoId()
      .withMessage('Valid college ID is required')
  ],
  getOrCreateDefaultCriteria
);

// Validate location
router.post(
  '/college/:collegeId/validate-location',
  [
    param('collegeId')
      .isMongoId()
      .withMessage('Valid college ID is required'),
    body('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),
    body('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),
    body('isCheckIn')
      .optional()
      .isBoolean()
      .withMessage('isCheckIn must be a boolean')
  ],
  validateLocation
);

// Check if date is a working day
router.get(
  '/college/:collegeId/working-day',
  [
    param('collegeId')
      .isMongoId()
      .withMessage('Valid college ID is required'),
    query('date')
      .optional()
      .isISO8601()
      .withMessage('Date must be a valid ISO 8601 date')
  ],
  checkWorkingDay
);

// Get expected check-in/check-out times
router.get(
  '/college/:collegeId/expected-times',
  [
    param('collegeId')
      .isMongoId()
      .withMessage('Valid college ID is required'),
    query('date')
      .optional()
      .isISO8601()
      .withMessage('Date must be a valid ISO 8601 date')
  ],
  getExpectedTimes
);

// Delete attendance criteria
router.delete(
  '/college/:collegeId',
  [
    param('collegeId')
      .isMongoId()
      .withMessage('Valid college ID is required')
  ],
  deleteCollegeAttendanceCriteria
);

module.exports = router;

