const { validationResult } = require('express-validator');
const Plan = require('../models/plan.model');

const planPopulate = [
  { path: 'createdBy', select: 'name email' },
  { path: 'createdCollege', select: 'name code' }
];

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

/**
 * Create a plan (subscription template).
 * POST /plans
 */
const createPlan = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const { name, code, description, billingCycle, amount, currency, limits, trialDays, isActive } = req.body;
    const plan = await Plan.create({
      name: name?.trim(),
      code: code?.trim()?.toUpperCase() || null,
      description: description?.trim() || null,
      billingCycle: billingCycle || 'yearly',
      amount: amount != null ? Number(amount) : 0,
      currency: (currency || 'INR').toString().toUpperCase().slice(0, 3),
      limits: limits || {},
      trialDays: trialDays != null ? Number(trialDays) : null,
      isActive: isActive !== false,
      createdBy: req.user?._id ?? null,
      createdCollege: req.user?.college ?? null
    });
    const populated = await Plan.findById(plan._id).populate(planPopulate);
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'Plan with this code already exists for this college' });
    } else {
      next(error);
    }
  }
};

/**
 * Get all plans (optional filter: createdCollege, isActive).
 * GET /plans
 */
const getAllPlans = async (req, res, next) => {
  try {
    const { createdCollege, isActive } = req.query;
    const filter = {};
    if (createdCollege) filter.createdCollege = createdCollege;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    const plans = await Plan.find(filter).populate(planPopulate).sort({ createdAt: -1 });
    res.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
};

/**
 * Get plan by ID.
 * GET /plans/:id
 */
const getPlanById = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id).populate(planPopulate);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a plan.
 * PUT /plans/:id
 */
const updatePlan = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    const { name, code, description, billingCycle, amount, currency, limits, trialDays, isActive } = req.body;
    if (name !== undefined) plan.name = name.trim();
    if (code !== undefined) plan.code = code?.trim()?.toUpperCase() || null;
    if (description !== undefined) plan.description = description?.trim() || null;
    if (billingCycle !== undefined) plan.billingCycle = billingCycle;
    if (amount !== undefined) plan.amount = Number(amount) >= 0 ? Number(amount) : plan.amount;
    if (currency !== undefined) plan.currency = currency.toString().toUpperCase().slice(0, 3);
    if (limits !== undefined) plan.limits = { ...plan.limits?.toObject?.() || plan.limits, ...limits };
    if (trialDays !== undefined) plan.trialDays = trialDays == null ? null : Number(trialDays);
    if (isActive !== undefined) plan.isActive = isActive;
    await plan.save();
    const populated = await Plan.findById(plan._id).populate(planPopulate);
    res.json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'Plan with this code already exists for this college' });
    } else {
      next(error);
    }
  }
};

/**
 * Delete a plan.
 * DELETE /plans/:id
 */
const deletePlan = async (req, res, next) => {
  try {
    const plan = await Plan.findByIdAndDelete(req.params.id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan
};
