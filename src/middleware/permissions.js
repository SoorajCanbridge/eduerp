const { getPermissionsForUser, hasPermission } = require('../utils/permissions');

const ensureUserPermissionsLoaded = async (req) => {
  if (!req.user) return;
  if (Array.isArray(req.user.permissions) && req.user.permissions.length > 0) {
    return;
  }
  const permissions = await getPermissionsForUser(req.user);
  req.user.permissions = permissions;
};

const requirePermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: 'Unauthorized' });
      }

      await ensureUserPermissionsLoaded(req);

      if (!hasPermission(req.user.permissions, resource, action)) {
        return res
          .status(403)
          .json({ success: false, message: 'Forbidden: insufficient permissions' });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = {
  requirePermission
};

