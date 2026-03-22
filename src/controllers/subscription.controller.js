const { validationResult } = require('express-validator');
const Subscription = require('../models/subscription.model');
const College = require('../models/college.model');
const Plan = require('../models/plan.model');

const subscriptionPopulate = [
  { path: 'college', select: 'name code' },
  { path: 'plan', select: 'name code amount currency billingCycle limits trialDays isActive' },
  { path: 'createdBy', select: 'name email' },
  { path: 'createdCollege', select: 'name code' },
  { path: 'cancelledBy', select: 'name email' }
];

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

const addBillingPeriodToDate = (dateValue, billingCycle) => {
  const d = new Date(dateValue);
  if (billingCycle === 'monthly') {
    d.setMonth(d.getMonth() + 1);
  } else {
    // default to yearly
    d.setFullYear(d.getFullYear() + 1);
  }
  return d;
};

/**
 * Create a new subscription for a college.
 * POST /subscriptions
 */
const createSubscription = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const {
      college: collegeId,
      plan: planId,
      status,
      startDate,
      endDate,
      billingCycle,
      amount,
      currency,
      limits,
      trialEndsAt,
      autoRenew,
      paymentRef,
      paidAt,
      periodStart,
      periodEnd
    } = req.body;
    const college = await College.findById(collegeId);
    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }
    const existing = await Subscription.findOne({ college: collegeId, status: { $ne: 'cancelled' } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'College already has a subscription' });
    }

    const planDoc = planId ? await Plan.findById(planId).lean() : null;
    if (planId && !planDoc) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(422).json({ success: false, message: 'Invalid startDate/endDate' });
    }

    const finalBillingCycle = billingCycle || planDoc?.billingCycle || 'yearly';
    const finalCurrency = (currency || planDoc?.currency || 'INR').toString().toUpperCase().slice(0, 3);
    const finalAmount =
      amount != null ? (Number(amount) >= 0 ? Number(amount) : 0) : Number(planDoc?.amount || 0);
    const finalLimits = limits || planDoc?.limits || {};

    const finalTrialEndsAt =
      trialEndsAt
        ? new Date(trialEndsAt)
        : planDoc?.trialDays != null && Number(planDoc.trialDays) > 0
          ? new Date(Date.now() + Number(planDoc.trialDays) * 24 * 60 * 60 * 1000)
          : null;

    const finalPaidAt = paidAt ? new Date(paidAt) : new Date();
    const finalPeriodStart = periodStart ? new Date(periodStart) : start;
    const finalPeriodEnd = periodEnd ? new Date(periodEnd) : end;

    if (
      Number.isNaN(finalPaidAt.getTime()) ||
      Number.isNaN(finalPeriodStart.getTime()) ||
      Number.isNaN(finalPeriodEnd.getTime())
    ) {
      return res.status(422).json({ success: false, message: 'Invalid payment dates' });
    }
    if (finalPeriodEnd <= finalPeriodStart) {
      return res.status(422).json({ success: false, message: 'periodEnd must be after periodStart' });
    }

    const finalAutoRenew = autoRenew !== false;
    const finalStatus = status || (finalTrialEndsAt ? 'trial' : 'active');

    const subscription = await Subscription.create({
      college: collegeId,
      plan: planId || null,
      status: finalStatus,
      startDate: start,
      endDate: end,
      billingCycle: finalBillingCycle,
      amount: finalAmount,
      currency: finalCurrency,
      limits: finalLimits,
      trialEndsAt: finalTrialEndsAt,
      autoRenew: finalAutoRenew,
      createdBy: req.user?._id ?? null,
      createdCollege: req.user?.college ?? null,
      paymentHistory: [
        {
          paidAt: finalPaidAt,
          amount: finalAmount,
          currency: finalCurrency,
          paymentRef: paymentRef ? String(paymentRef).trim().slice(0, 200) : null,
          periodStart: finalPeriodStart,
          periodEnd: finalPeriodEnd,
          paidBy: req.user?._id ?? null
        }
      ]
    });
    await College.findByIdAndUpdate(collegeId, { subscription: subscription._id });
    const populated = await Subscription.findById(subscription._id).populate(subscriptionPopulate);
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all subscriptions (with optional filters).
 * GET /subscriptions
 */
const getAllSubscriptions = async (req, res, next) => {
  try {
    const { status, plan, createdCollege } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (plan) filter.plan = plan;
    if (createdCollege) filter.createdCollege = createdCollege;
    const subscriptions = await Subscription.find(filter)
      .populate(subscriptionPopulate)
      .sort({ createdAt: -1 });
    res.json({ success: true, data: subscriptions });
  } catch (error) {
    next(error);
  }
};

/**
 * Get subscription for a college by college ID.
 * GET /subscriptions/college/:collegeId
 */
const getSubscriptionByCollegeId = async (req, res, next) => {
  try {
    const { collegeId } = req.params;
    const subscription = await Subscription.findOne({ college: collegeId }).populate(
      subscriptionPopulate
    );
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found for this college'
      });
    }
    res.json({ success: true, data: subscription });
  } catch (error) {
    next(error);
  }
};

/**
 * Get subscriptions created by a given college.
 * GET /subscriptions/created-by-college/:collegeId
 */
const getSubscriptionsByCreatedCollege = async (req, res, next) => {
  try {
    const { collegeId } = req.params;
    const subscriptions = await Subscription.find({ createdCollege: collegeId })
      .populate(subscriptionPopulate)
      .sort({ createdAt: -1 });
    res.json({ success: true, data: subscriptions });
  } catch (error) {
    next(error);
  }
};

/**
 * Get subscription for the logged-in user's college.
 * GET /subscriptions/me
 */
const getMyCollegeSubscription = async (req, res, next) => {
  try {
    const collegeId = req.user?.college;
    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'User is not associated with any college'
      });
    }
    const subscription = await Subscription.findOne({ college: collegeId }).populate(
      subscriptionPopulate
    );
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found for your college'
      });
    }
    res.json({ success: true, data: subscription });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel a subscription.
 * POST /subscriptions/:id/cancel
 */
const cancelSubscription = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }
    if (subscription.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot add payment to a cancelled subscription' });
    }
    if (subscription.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Subscription is already cancelled' });
    }
    const { cancelReason } = req.body;
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    subscription.cancelledBy = req.user?._id ?? null;
    if (cancelReason != null) subscription.cancelReason = String(cancelReason).trim();
    await subscription.save();
    const populated = await Subscription.findById(subscription._id).populate(subscriptionPopulate);
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/**
 * Renew a subscription: extend endDate and add renewal + payment history.
 * POST /subscriptions/:id/renew
 */
const renewSubscription = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }
    if (subscription.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot renew a cancelled subscription' });
    }
    const { newEndDate, amount, currency, paymentRef } = req.body;
    const previousEndDate = new Date(subscription.endDate);
    const newEnd = new Date(newEndDate);
    if (newEnd <= previousEndDate) {
      return res.status(400).json({
        success: false,
        message: 'newEndDate must be after current endDate'
      });
    }
    const finalCurrency = (currency || subscription.currency || 'INR')
      .toString()
      .toUpperCase()
      .slice(0, 3);
    const finalAmount =
      amount != null ? (Number(amount) >= 0 ? Number(amount) : 0) : Number(subscription.amount || 0);

    const paidAt = new Date();
    subscription.renewalHistory.push({
      renewedAt: paidAt,
      previousEndDate,
      newEndDate: newEnd,
      renewedBy: req.user?._id ?? null
    });
    subscription.paymentHistory.push({
      paidAt,
      amount: finalAmount,
      currency: finalCurrency,
      paymentRef: paymentRef ? String(paymentRef).trim().slice(0, 200) : null,
      periodStart: previousEndDate,
      periodEnd: newEnd,
      paidBy: req.user?._id ?? null
    });
    subscription.endDate = newEnd;
    subscription.amount = finalAmount;
    subscription.currency = finalCurrency;
    if (['expired', 'trial', 'past_due'].includes(subscription.status)) subscription.status = 'active';
    await subscription.save();
    const populated = await Subscription.findById(subscription._id).populate(subscriptionPopulate);
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/**
 * Upgrade subscription: change plan + extend endDate + add renewal/payment history.
 * POST /subscriptions/:id/upgrade
 */
const upgradeSubscription = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }
    if (subscription.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot upgrade a cancelled subscription' });
    }

    const { plan: planId, newEndDate, amount, currency, paymentRef } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const previousEndDate = new Date(subscription.endDate);
    const computedEndDate = newEndDate
      ? new Date(newEndDate)
      : addBillingPeriodToDate(previousEndDate, plan.billingCycle);

    if (computedEndDate <= previousEndDate) {
      return res.status(400).json({
        success: false,
        message: 'newEndDate must be after current endDate'
      });
    }

    const paidAt = new Date();
    const finalCurrency = (currency || plan.currency || subscription.currency || 'INR')
      .toString()
      .toUpperCase()
      .slice(0, 3);
    const finalAmount =
      amount != null ? (Number(amount) >= 0 ? Number(amount) : 0) : Number(plan.amount || 0);

    subscription.plan = plan._id;
    subscription.billingCycle = plan.billingCycle;
    subscription.amount = finalAmount;
    subscription.currency = finalCurrency;
    subscription.limits = plan.limits || {};
    subscription.trialEndsAt =
      plan.trialDays != null && Number(plan.trialDays) > 0
        ? new Date(Date.now() + Number(plan.trialDays) * 24 * 60 * 60 * 1000)
        : null;

    subscription.status = 'active';
    subscription.renewalHistory.push({
      renewedAt: paidAt,
      previousEndDate,
      newEndDate: computedEndDate,
      renewedBy: req.user?._id ?? null
    });
    subscription.paymentHistory.push({
      paidAt,
      amount: finalAmount,
      currency: finalCurrency,
      paymentRef: paymentRef ? String(paymentRef).trim().slice(0, 200) : null,
      periodStart: previousEndDate,
      periodEnd: computedEndDate,
      paidBy: req.user?._id ?? null
    });

    subscription.endDate = computedEndDate;
    await subscription.save();

    const populated = await Subscription.findById(subscription._id).populate(subscriptionPopulate);
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a payment to subscription history.
 * POST /subscriptions/:id/payment
 */
const addPaymentToSubscription = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    const {
      amount,
      currency,
      paymentRef,
      periodStart,
      periodEnd,
      extendEndDate
    } = req.body;

    const paidAt = new Date();
    const finalCurrency = (currency || subscription.currency || 'INR')
      .toString()
      .toUpperCase()
      .slice(0, 3);
    const finalAmount = Number(amount) >= 0 ? Number(amount) : 0;

    const ps = new Date(periodStart);
    const pe = new Date(periodEnd);
    if (Number.isNaN(ps.getTime()) || Number.isNaN(pe.getTime())) {
      return res.status(422).json({ success: false, message: 'Invalid periodStart/periodEnd' });
    }
    if (pe <= ps) {
      return res.status(422).json({ success: false, message: 'periodEnd must be after periodStart' });
    }

    subscription.paymentHistory.push({
      paidAt,
      amount: finalAmount,
      currency: finalCurrency,
      paymentRef: paymentRef ? String(paymentRef).trim().slice(0, 200) : null,
      periodStart: ps,
      periodEnd: pe,
      paidBy: req.user?._id ?? null
    });

    if (extendEndDate) {
      subscription.endDate = pe;
      subscription.amount = finalAmount;
      subscription.currency = finalCurrency;
      if (['expired', 'trial', 'past_due'].includes(subscription.status)) subscription.status = 'active';
    }

    await subscription.save();
    const populated = await Subscription.findById(subscription._id).populate(subscriptionPopulate);
    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSubscription,
  getAllSubscriptions,
  getSubscriptionByCollegeId,
  getSubscriptionsByCreatedCollege,
  getMyCollegeSubscription,
  cancelSubscription,
  renewSubscription,
  upgradeSubscription,
  addPaymentToSubscription
};
