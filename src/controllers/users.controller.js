const { validationResult } = require('express-validator');
const User = require('../models/user.model');

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

    const user = await User.findOne(conditions).select('-password').populate('college', 'name code').lean();
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

    const user = await User.create(payload);
    const data = await User.findById(user._id).select('-password').populate('college', 'name code').lean();
    res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'Email already exists' });
    } else {
      next(error);
    }
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
    const data = await User.findById(user._id).select('-password').populate('college', 'name code').lean();
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
  updateUser,
  deleteUser
};
