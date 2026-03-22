const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const { getDefaultRoleId } = require('../utils/permissions');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

const getAllUsers = async (req, res, next) => {
  try {
    const { role, isActive, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = req.query;
    const filters = {};

    if (req.user.college) {
      filters.college = req.user.college;
    }
    if (role) filters.role = role;
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;
    const allowedSort = ['name', 'email', 'role', 'createdAt', 'updatedAt', 'lastLoginAt'];
    const sortField = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
    const sort = { [sortField]: order === 'asc' ? 1 : -1 };

    const [users, total] = await Promise.all([
      User.find(filters)
        .select('-password')
        .populate('college', 'name code')
        .populate('role', 'name description permissions')
        .populate('createdBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filters)
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const conditions = { _id: req.params.id };
    if (req.user.college) conditions.college = req.user.college;

    const user = await User.findOne(conditions)
      .select('-password')
      .populate('college', 'name code')
      .populate('role', 'name description permissions')
      .populate('createdBy', 'name email')
      .lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payload = { ...req.body };
    payload.college = req.user.college;
    payload.createdBy = req.user?._id ?? null;
    if (payload.role === undefined || payload.role === null || payload.role === '') {
      payload.role = await getDefaultRoleId();
    }

    const user = await User.create(payload);
    const data = await User.findById(user._id)
      .select('-password')
      .populate('college', 'name code')
      .populate('role', 'name description permissions')
      .populate('createdBy', 'name email')
      .lean();
    res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'Email already exists' });
    } else {
      next(error);
    }
  }
};

/**
 * Create a client user (same User schema, prefers "client" role when available).
 * POST /client
 */
const createClient = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payload = { ...req.body };
    payload.createdBy = req.user._id;
    if (req.user?.college) {
      payload.college = req.user.college;
    }
    const user = await User.create(payload);
    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'Email already exists' });
    } else {
      next(error);
    }
  }
};

/**
 * Get clients created by logged-in user or users in creator college.
 * GET /client
 */
const getClients = async (req, res, next) => {
  try {
    let requesterCollegeId = req.user?.college || null;
    if (!requesterCollegeId) {
      return res.status(400).json({
        success: false,
        message: 'User is not associated with any college'
      });
    }

    // If college comes in as a string, convert to ObjectId for correct $match.
    if (typeof requesterCollegeId === 'string') {
      requesterCollegeId = new mongoose.Types.ObjectId(requesterCollegeId);
    }

    // Requirements:
    // - client.college == req.user.college
    // - client.createdBy.college != req.user.college
    const clients = await User.aggregate([
      // Only clients inside requester's college
     

      // Populate creator user (createdBy) safely (only non-sensitive fields)
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creator'
        }
      },
      { $unwind: '$creator' },

      // Exclude when creator user belongs to the same college
      { $match: { 'college': { $ne: requesterCollegeId } } },

      // Populate client college (name + code)
      {
        $lookup: {
          from: 'colleges',
          localField: 'college',
          foreignField: '_id',
          as: 'collegeDoc'
        }
      },
      { $unwind: '$collegeDoc' },

      // Populate college.subscription (and subscription.plan) safely
      {
        $lookup: {
          from: 'subscriptions',
          localField: 'collegeDoc.subscription',
          foreignField: '_id',
          as: 'subscriptionDoc'
        }
      },
      { $unwind: { path: '$subscriptionDoc', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'plans',
          localField: 'subscriptionDoc.plan',
          foreignField: '_id',
          as: 'planDoc'
        }
      },
      { $unwind: { path: '$planDoc', preserveNullAndEmptyArrays: true } },

      // Hide sensitive data by projecting only safe fields
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phone: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          college: {
            _id: '$collegeDoc._id',
            name: '$collegeDoc.name',
            code: '$collegeDoc.code',
            address: '$collegeDoc.address',
            city: '$collegeDoc.city',
            state: '$collegeDoc.state',
            pincode: '$collegeDoc.pincode',
            phone: '$collegeDoc.phone',
            email: '$collegeDoc.email',
            website: '$collegeDoc.website',
            establishedYear: '$collegeDoc.establishedYear',
            logo: '$collegeDoc.logo',
            createdAt: '$collegeDoc.createdAt',
            updatedAt: '$collegeDoc.updatedAt',
            subscription: {
              $cond: [
                { $ne: ['$subscriptionDoc._id', null] },
                {
                  _id: '$subscriptionDoc._id',
                  status: '$subscriptionDoc.status',
                  startDate: '$subscriptionDoc.startDate',
                  endDate: '$subscriptionDoc.endDate',
                  billingCycle: '$subscriptionDoc.billingCycle',
                  amount: '$subscriptionDoc.amount',
                  currency: '$subscriptionDoc.currency',
                  trialEndsAt: '$subscriptionDoc.trialEndsAt',
                  autoRenew: '$subscriptionDoc.autoRenew',
                  limits: '$subscriptionDoc.limits',
                  renewalHistory: {
                    $map: {
                      input: { $ifNull: ['$subscriptionDoc.renewalHistory', []] },
                      as: 'rh',
                      in: {
                        renewedAt: '$$rh.renewedAt',
                        previousEndDate: '$$rh.previousEndDate',
                        newEndDate: '$$rh.newEndDate',
                        renewedBy: '$$rh.renewedBy'
                      }
                    }
                  },
                  paymentHistory: {
                    $map: {
                      input: { $ifNull: ['$subscriptionDoc.paymentHistory', []] },
                      as: 'ph',
                      in: {
                        paidAt: '$$ph.paidAt',
                        amount: '$$ph.amount',
                        currency: '$$ph.currency',
                        paymentRef: '$$ph.paymentRef',
                        periodStart: '$$ph.periodStart',
                        periodEnd: '$$ph.periodEnd',
                        paidBy: '$$ph.paidBy'
                      }
                    }
                  },
                  plan: {
                    $cond: [
                      { $ne: ['$planDoc._id', null] },
                      {
                        _id: '$planDoc._id',
                        name: '$planDoc.name',
                        code: '$planDoc.code',
                        billingCycle: '$planDoc.billingCycle',
                        amount: '$planDoc.amount',
                        currency: '$planDoc.currency'
                      },
                      null
                    ]
                  }
                },
                null
              ]
            }
          },
          createdBy: {
            _id: '$creator._id',
            name: '$creator.name',
            email: '$creator.email'
          }
        }
      },

      { $sort: { createdAt: -1 } }
    ]);

    res.json({ success: true, data: clients });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single client by id.
 * GET /client/:id
 */
const getClientById = async (req, res, next) => {
  try {
    let requesterCollegeId = req.user?.college || null;
    if (!requesterCollegeId) {
      return res.status(400).json({
        success: false,
        message: 'User is not associated with any college'
      });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(422).json({ success: false, message: 'Invalid client id' });
    }
    let clientId = req.params.id;

    if (typeof requesterCollegeId === 'string') {
      requesterCollegeId = new mongoose.Types.ObjectId(requesterCollegeId);
    }
    if (typeof clientId === 'string') {
      clientId = new mongoose.Types.ObjectId(clientId);
    }

    const clients = await User.aggregate([
      { $match: { _id: clientId } },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creator'
        }
      },
      { $unwind: '$creator' },

      {
        $lookup: {
          from: 'colleges',
          localField: 'college',
          foreignField: '_id',
          as: 'collegeDoc'
        }
      },
      { $unwind: '$collegeDoc' },

      {
        $lookup: {
          from: 'subscriptions',
          localField: 'collegeDoc.subscription',
          foreignField: '_id',
          as: 'subscriptionDoc'
        }
      },
      { $unwind: { path: '$subscriptionDoc', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'plans',
          localField: 'subscriptionDoc.plan',
          foreignField: '_id',
          as: 'planDoc'
        }
      },
      { $unwind: { path: '$planDoc', preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phone: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          college: {
            _id: '$collegeDoc._id',
            name: '$collegeDoc.name',
            code: '$collegeDoc.code',
            address: '$collegeDoc.address',
            city: '$collegeDoc.city',
            state: '$collegeDoc.state',
            pincode: '$collegeDoc.pincode',
            phone: '$collegeDoc.phone',
            email: '$collegeDoc.email',
            website: '$collegeDoc.website',
            establishedYear: '$collegeDoc.establishedYear',
            logo: '$collegeDoc.logo',
            createdAt: '$collegeDoc.createdAt',
            updatedAt: '$collegeDoc.updatedAt',
            subscription: {
              $cond: [
                { $ne: ['$subscriptionDoc._id', null] },
                {
                  _id: '$subscriptionDoc._id',
                  status: '$subscriptionDoc.status',
                  startDate: '$subscriptionDoc.startDate',
                  endDate: '$subscriptionDoc.endDate',
                  billingCycle: '$subscriptionDoc.billingCycle',
                  amount: '$subscriptionDoc.amount',
                  currency: '$subscriptionDoc.currency',
                  trialEndsAt: '$subscriptionDoc.trialEndsAt',
                  autoRenew: '$subscriptionDoc.autoRenew',
                  limits: '$subscriptionDoc.limits',
                  renewalHistory: {
                    $map: {
                      input: { $ifNull: ['$subscriptionDoc.renewalHistory', []] },
                      as: 'rh',
                      in: {
                        renewedAt: '$$rh.renewedAt',
                        previousEndDate: '$$rh.previousEndDate',
                        newEndDate: '$$rh.newEndDate',
                        renewedBy: '$$rh.renewedBy'
                      }
                    }
                  },
                  paymentHistory: {
                    $map: {
                      input: { $ifNull: ['$subscriptionDoc.paymentHistory', []] },
                      as: 'ph',
                      in: {
                        paidAt: '$$ph.paidAt',
                        amount: '$$ph.amount',
                        currency: '$$ph.currency',
                        paymentRef: '$$ph.paymentRef',
                        periodStart: '$$ph.periodStart',
                        periodEnd: '$$ph.periodEnd',
                        paidBy: '$$ph.paidBy'
                      }
                    }
                  },
                  plan: {
                    $cond: [
                      { $ne: ['$planDoc._id', null] },
                      {
                        _id: '$planDoc._id',
                        name: '$planDoc.name',
                        code: '$planDoc.code',
                        billingCycle: '$planDoc.billingCycle',
                        amount: '$planDoc.amount',
                        currency: '$planDoc.currency'
                      },
                      null
                    ]
                  }
                },
                null
              ]
            }
          },
          createdBy: {
            _id: '$creator._id',
            name: '$creator.name',
            email: '$creator.email'
          }
        }
      }
    ]);

    if (!clients || clients.length === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    res.json({ success: true, data: clients[0] });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const conditions = { _id: req.params.id };
    if (req.user.college) conditions.college = req.user.college;

    const user = await User.findOne(conditions);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updatableFields = ['name', 'email', 'phone', 'role', 'college', 'isActive'];
    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) user[field] = req.body[field];
    });
    if (req.body.password && String(req.body.password).trim().length >= 6) {
      user.password = req.body.password;
    }

    await user.save();
    const data = await User.findById(user._id)
      .select('-password')
      .populate('college', 'name code')
      .populate('role', 'name description permissions')
      .populate('createdBy', 'name email')
      .lean();
    res.json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'Email already exists' });
    } else {
      next(error);
    }
  }
};

const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    const conditions = { _id: req.params.id };
    if (req.user.college) conditions.college = req.user.college;

    const user = await User.findOneAndDelete(conditions);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  createClient,
  getClients,
  getClientById,
  updateUser,
  deleteUser
};
