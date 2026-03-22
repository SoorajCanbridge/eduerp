const express = require('express');
const { body, param, validationResult } = require('express-validator');
const {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan
} = require('../controllers/plan.controller');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { BILLING_CYCLES } = require('../models/plan.model');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }
  next();
};

const createValidators = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 characters)'),
  body('code').optional().trim().isLength({ max: 50 }).withMessage('Code max 50 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description max 500 characters'),
  body('billingCycle').optional().isIn(BILLING_CYCLES).withMessage(`billingCycle must be one of: ${BILLING_CYCLES.join(', ')}`),
  body('amount').optional().isFloat({ min: 0 }).withMessage('amount must be a non-negative number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('currency must be 3 characters'),
  body('limits').optional().isObject().withMessage('limits must be an object'),
  body('trialDays').optional().isInt({ min: 0 }).withMessage('trialDays must be a non-negative integer'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

const updateValidators = [
  param('id').isMongoId().withMessage('Valid plan ID is required'),
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name max 100 characters'),
  body('code').optional().trim().isLength({ max: 50 }).withMessage('Code max 50 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description max 500 characters'),
  body('billingCycle').optional().isIn(BILLING_CYCLES).withMessage(`billingCycle must be one of: ${BILLING_CYCLES.join(', ')}`),
  body('amount').optional().isFloat({ min: 0 }).withMessage('amount must be a non-negative number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('currency must be 3 characters'),
  body('limits').optional().isObject().withMessage('limits must be an object'),
  body('trialDays').optional().isInt({ min: 0 }).withMessage('trialDays must be a non-negative integer'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

router.use(auth);

router.get('/', requirePermission('settings', 'view'), getAllPlans);
router.get('/:id', requirePermission('settings', 'view'), param('id').isMongoId(), validate, getPlanById);
router.post('/', requirePermission('settings', 'edit'), createValidators, validate, createPlan);
router.put('/:id', requirePermission('settings', 'edit'), updateValidators, validate, updatePlan);
router.delete('/:id', requirePermission('settings', 'edit'), param('id').isMongoId(), validate, deletePlan);

module.exports = router;
