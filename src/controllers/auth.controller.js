const { validationResult } = require('express-validator');
const User = require('../models/user.model');
const { generateToken } = require('../utils/token');
const env = require('../config/env');
const { getPermissionsForUser, getDefaultRoleId } = require('../utils/permissions');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

const attachAuthCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.nodeEnv === 'production',
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  });
};

const toRoleInfo = (role) => {
  if (!role) return null;
  const r = role._id ? role : { _id: role };
  return {
    _id: r._id,
    name: r.name,
    description: r.description,
    permissions: Array.isArray(r.permissions) ? r.permissions : []
  };
};

const register = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const { name, email, password, role: roleId, college } = req.body;
    const existing = await User.findOne({ email });

    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: 'Email already registered' });
    }

    const resolvedRoleId = roleId || (await getDefaultRoleId());
    const user = await User.create({
      name,
      email,
      password,
      role: resolvedRoleId,
      college: college || null
    });
    const token = generateToken(user);

    const populated = await User.findById(user._id)
      .select('-password')
      .populate('college', 'name code')
      .populate('role')
      .lean();

    const permissions = await getPermissionsForUser(populated);
    const userJson = { ...populated, permissions, role: toRoleInfo(populated?.role) };

    attachAuthCookie(res, token);
    return res
      .status(201)
      .json({ success: true, token, data: { user: userJson } });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password').populate('role');

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid credentials' });
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user);
    attachAuthCookie(res, token);

    const permissions = await getPermissionsForUser(user);
    const userJson = user.toJSON();
    userJson.permissions = permissions;
    userJson.role = toRoleInfo(user.role);

    return res.json({
      success: true,
      token,
      data: { user: userJson }
    });
  } catch (error) {
    return next(error);
  }
};

const getProfile = async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-password')
    .populate('college', 'name code')
    .populate('role')
    .lean();
  if (!user) {
    return res.status(401).json({ success: false, message: 'User no longer exists' });
  }
  const permissions = await getPermissionsForUser(user);
  user.permissions = permissions;
  user.role = toRoleInfo(user.role);
  res.json({ success: true, data: { user } });
};

const logout = (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
};

module.exports = {
  register,
  login,
  getProfile,
  logout
};

