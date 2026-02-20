const express = require('express');
const { body, param, query } = require('express-validator');
const {
  upsertConfig,
  getConfigByCollege,
  createCourse,
  listCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  promoteLevelCValue
} = require('../controllers/academic.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

const configValidators = [
  param('collegeId')
    .isMongoId()
    .withMessage('Valid collegeId is required'),
  body('levelNames.A')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('levelNames.A must be between 1 and 50 characters'),
  body('levelNames.B')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('levelNames.B must be between 1 and 50 characters'),
  body('levelNames.C')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('levelNames.C must be between 1 and 50 characters'),
  body('levelValues.A')
    .optional()
    .isArray({ max: 50 })
    .withMessage('levelValues.A must be an array with up to 50 entries'),
  body('levelValues.A.*')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('levelValues.A entries must be between 1 and 50 characters'),
  body('levelValues.B')
    .optional()
    .isArray({ max: 50 })
    .withMessage('levelValues.B must be an array with up to 50 entries'),
  body('levelValues.B.*.parent')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('levelValues.B parent must be between 1 and 50 characters'),
  body('levelValues.B.*.values')
    .optional()
    .isArray({ max: 50 })
    .withMessage('levelValues.B values must be an array with up to 50 entries'),
  body('levelValues.B.*.values.*')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('levelValues.B values entries must be between 1 and 50 characters'),
  body('levelValues.C')
    .optional()
    .isArray({ max: 50 })
    .withMessage('levelValues.C must be an array with up to 50 entries'),
  body('levelValues.C.*.parent')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('levelValues.C parent must be between 1 and 50 characters'),
  body('levelValues.C.*.values')
    .optional()
    .isArray({ max: 50 })
    .withMessage('levelValues.C values must be an array with up to 50 entries'),
  body('levelValues.C.*.values.*')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('levelValues.C values entries must be between 1 and 50 characters')
];

const courseCreateValidators = [
  body('batch')
    .isLength({ min: 1, max: 50 })
    .withMessage('batch is required'),
  body('name')
    .isLength({ min: 2, max: 120 })
    .withMessage('name is required and must be at least 2 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('description can be up to 500 characters'),
  body('levelA')
    .isLength({ min: 1, max: 100 })
    .withMessage('levelA is required'),
  body('levelB')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('levelB must be between 1 and 100 characters when provided'),
  body('levelC')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('levelC must be between 1 and 100 characters when provided'),
  body('academicDuration.value')
    .isInt({ min: 1 })
    .withMessage('academicDuration.value is required and must be at least 1'),
  body('academicDuration.unit')
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('academicDuration.unit must be one of: day, week, month, year'),
  body('startDate')
    .isISO8601()
    .withMessage('startDate is required and must be a valid ISO 8601 date'),
  body('tutor')
    .optional()
    .isMongoId()
    .withMessage('tutor must be a valid MongoDB ObjectId'),
  body('completedDate')
    .optional()
    .isISO8601()
    .withMessage('completedDate must be a valid ISO 8601 date'),
  body('seatLimit')
    .isInt({ min: 1 })
    .withMessage('seatLimit is required and must be at least 1'),
  body('isActive')
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage('isActive must be boolean')
];

const courseUpdateValidators = [
  param('id')
    .isMongoId()
    .withMessage('Valid course id is required'),
  body('collegeId')
    .optional()
    .isMongoId()
    .withMessage('collegeId must be a valid id'),
  body('batch')
    .optional()
    .isLength({ min: 1, max: 50 }),
  body('name')
    .optional()
    .isLength({ min: 2, max: 120 }),
  body('description')
    .optional()
    .isLength({ max: 500 }),
  body('levelA')
    .optional()
    .isLength({ min: 1, max: 100 }),
  body('levelB')
    .optional()
    .isLength({ min: 1, max: 100 }),
  body('levelC')
    .optional()
    .isLength({ min: 1, max: 100 }),
  body('academicDuration')
    .optional()
    .custom((value) => {
      if (value && typeof value === 'object') {
        if (!value.value || !value.unit) {
          throw new Error('academicDuration must include both value and unit');
        }
        if (!['day', 'week', 'month', 'year'].includes(value.unit)) {
          throw new Error('academicDuration.unit must be one of: day, week, month, year');
        }
        if (!Number.isInteger(value.value) || value.value < 1) {
          throw new Error('academicDuration.value must be an integer at least 1');
        }
      }
      return true;
    }),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('startDate must be a valid ISO 8601 date'),
  body('tutor')
    .optional()
    .isMongoId()
    .withMessage('tutor must be a valid MongoDB ObjectId'),
  body('completedDate')
    .optional()
    .isISO8601()
    .withMessage('completedDate must be a valid ISO 8601 date'),
  body('seatLimit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('seatLimit must be an integer at least 1'),
  body('isActive')
    .optional()
    .isBoolean()
    .toBoolean()
];

const listValidators = [
  query('collegeId')
    .optional()
    .isMongoId()
    .withMessage('collegeId must be a valid id'),
  query('levelA')
    .optional()
    .isLength({ min: 1, max: 100 }),
  query('levelB')
    .optional()
    .isLength({ min: 1, max: 100 }),
  query('levelC')
    .optional()
    .isLength({ min: 1, max: 100 }),
  query('includeInactive')
    .optional()
    .isBoolean()
    .toBoolean()
];

router.put('/config/:collegeId', configValidators, upsertConfig);
router.get(
  '/config/:collegeId',
  [
    param('collegeId')
      .isMongoId()
      .withMessage('Valid collegeId is required')
  ],
  getConfigByCollege
);



router.post(
  '/config/:id/promote-level-c',
  promoteLevelCValue
);

router.get('/courses', listValidators, listCourses);
router.post('/courses', courseCreateValidators, createCourse);
router.get(
  '/courses/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Valid course id is required')
  ],
  getCourseById
);
router.put('/courses/:id', courseUpdateValidators, updateCourse);
router.delete(
  '/courses/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Valid course id is required')
  ],
  deleteCourse
);

module.exports = router;

