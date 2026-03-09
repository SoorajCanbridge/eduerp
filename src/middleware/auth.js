const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/user.model');
const { getPermissionsForUser } = require('../utils/permissions');

const extractToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return req.cookies?.token;
};

const authMiddleware = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(decoded.sub)
      .select('-password')
      .populate('role');

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: 'User no longer exists' });
    }

    const permissions = await getPermissionsForUser(user);
    user.permissions = permissions;

    req.user = user;
    return next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;

