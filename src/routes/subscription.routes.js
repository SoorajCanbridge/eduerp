const express = require('express');
const { body, param, validationResult } = require('express-validator');
const {
  createSubscription,
  getAllSubscriptions,
  getSubscriptionByCollegeId,
  getSubscriptionsByCreatedCollege,
  getMyCollegeSubscription,
  cancelSubscription,
  renewSubscription,
  upgradeSubscription,
  addPaymentToSubscription
} = require('../controllers/subscription.controller');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { STATUS_VALUES, BILLING_CYCLES } = require('../models/subscription.model');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }
  next();
};

const createValidators = [
  body('college').isMongoId().withMessage('Valid college ID is required'),
  body('plan').optional().isMongoId().withMessage('Plan must be a valid Mongo ID'),
  body('status').optional().isIn(STATUS_VALUES).withMessage(`Status must be one of: ${STATUS_VALUES.join(', ')}`),
  body('startDate').optional().isISO8601().withMessage('startDate must be a valid date'),
  body('endDate').isISO8601().withMessage('endDate is required and must be a valid date'),
  body('billingCycle').optional().isIn(BILLING_CYCLES).withMessage(`billingCycle must be one of: ${BILLING_CYCLES.join(', ')}`),
  body('amount').optional().isFloat({ min: 0 }).withMessage('amount must be a non-negative number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('currency must be 3 characters'),
  body('limits').optional().isObject().withMessage('limits must be an object'),
  body('trialEndsAt').optional().isISO8601().withMessage('trialEndsAt must be a valid date'),
  body('autoRenew').optional().isBoolean().withMessage('autoRenew must be a boolean'),
  body('paymentRef').optional().isString().trim().isLength({ max: 200 }).withMessage('paymentRef max 200 characters'),
  body('paidAt').optional().isISO8601().withMessage('paidAt must be a valid date'),
  body('periodStart').optional().isISO8601().withMessage('periodStart must be a valid date'),
  body('periodEnd').optional().isISO8601().withMessage('periodEnd must be a valid date')
];

const cancelValidators = [
  param('id').isMongoId().withMessage('Valid subscription ID is required'),
  body('cancelReason').optional().isString().trim().isLength({ max: 500 }).withMessage('cancelReason max 500 characters')
];

const renewValidators = [
  param('id').isMongoId().withMessage('Valid subscription ID is required'),
  body('newEndDate').isISO8601().withMessage('newEndDate is required and must be a valid date'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('amount must be a non-negative number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('currency must be 3 characters'),
  body('paymentRef').optional().isString().trim().isLength({ max: 200 }).withMessage('paymentRef max 200 characters')
];

const upgradeValidators = [
  param('id').isMongoId().withMessage('Valid subscription ID is required'),
  body('plan').isMongoId().withMessage('plan is required and must be a valid Mongo ID'),
  body('newEndDate').optional().isISO8601().withMessage('newEndDate must be a valid date'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('amount must be a non-negative number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('currency must be 3 characters'),
  body('paymentRef').optional().isString().trim().isLength({ max: 200 }).withMessage('paymentRef max 200 characters')
];

const paymentValidators = [
  param('id').isMongoId().withMessage('Valid subscription ID is required'),
  body('amount').isFloat({ min: 0 }).withMessage('amount is required and must be a non-negative number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('currency must be 3 characters'),
  body('paymentRef').optional().isString().trim().isLength({ max: 200 }).withMessage('paymentRef max 200 characters'),
  body('periodStart').isISO8601().withMessage('periodStart is required and must be a valid date'),
  body('periodEnd').isISO8601().withMessage('periodEnd is required and must be a valid date'),
  body('extendEndDate').optional().isBoolean().withMessage('extendEndDate must be boolean')
];

router.use(auth);

// Logged-in user's college subscription (must be before /:id)
router.get('/me', getMyCollegeSubscription);

// Subscriptions created by a college (must be before /:id)
router.get(
  '/created-by-college/:collegeId',
  requirePermission('settings', 'view'),
  param('collegeId').isMongoId().withMessage('Valid college ID is required'),
  validate,
  getSubscriptionsByCreatedCollege
);

// Get all subscriptions (optional query: status, plan, createdCollege)
router.get('/', requirePermission('settings', 'view'), getAllSubscriptions);

// Subscription by college ID
router.get(
  '/college/:collegeId',
  requirePermission('settings', 'view'),
  param('collegeId').isMongoId().withMessage('Valid college ID is required'),
  validate,
  getSubscriptionByCollegeId
);

// Create subscription
router.post('/', requirePermission('settings', 'edit'), createValidators, validate, createSubscription);

// Cancel subscription
router.post('/:id/cancel', requirePermission('settings', 'edit'), cancelValidators, validate, cancelSubscription);

// Renew subscription
router.post('/:id/renew', requirePermission('settings', 'edit'), renewValidators, validate, renewSubscription);

// Upgrade subscription
router.post('/:id/upgrade', requirePermission('settings', 'edit'), upgradeValidators, validate, upgradeSubscription);

// Add payment to subscription
router.post('/:id/payment', requirePermission('settings', 'edit'), paymentValidators, validate, addPaymentToSubscription);

module.exports = router;
