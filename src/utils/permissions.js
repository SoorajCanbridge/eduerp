const Role = require('../models/role.model');

/**
 * Permission resources (view = get only, edit = create/update/delete):
 * academic, students, staff, attendance, fees, invoice, payments, payroll, finance, settings, team
 */
const OWNER_ROLE_RESOURCES = [
  'Main',
  'academic',
  'students',
  'staff',
  'attendance',
  'fees',
  'invoice',
  'payments',
  'payroll',
  'finance',
  'settings',
  'team'
];

/**
 * Actions: view = read only (GET); edit = view + create + update + delete; none = no access.
 * Only use: view, edit, none (or omit for no access).
 */
const PERMISSION_ACTIONS = ['view', 'edit', 'none'];

/** Owner role: all resources with action edit (full access). */
const getOwnerPermissions = () =>
  OWNER_ROLE_RESOURCES.map((resource) => ({ resource, action: 'edit' }));

const DEFAULT_ROLE_NAME = 'user';

/**
 * Default "user" role: Academics, Students, Staff, Fees, Invoice, Payments, Payroll, Finance, Settings, Team.
 * All as view-only when no role is provided on signup/create user.
 */
const DEFAULT_ROLE_PERMISSIONS = [
  { resource: 'academic', action: 'view' },
  { resource: 'students', action: 'view' },
  { resource: 'staff', action: 'view' },
  { resource: 'attendance', action: 'view' },
  { resource: 'fees', action: 'view' },
  { resource: 'invoice', action: 'view' },
  { resource: 'payments', action: 'view' },
  { resource: 'payroll', action: 'view' },
  { resource: 'finance', action: 'view' },
  { resource: 'settings', action: 'view' },
  { resource: 'team', action: 'view' }
];

const getDefaultRolePermissions = () => [...DEFAULT_ROLE_PERMISSIONS];

/**
 * Get the default role id (global "user" role). Used when creating a user without a role.
 * @returns {Promise<ObjectId|null>}
 */
const getDefaultRoleId = async () => {
  const role = await Role.findOne({ name: DEFAULT_ROLE_NAME, college: null })
    .select('_id')
    .lean();
  return role ? role._id : null;
};

const normalizeAction = (action) => {
  const a = action && String(action).trim().toLowerCase();
  if (a === 'edit' || a === '*') return 'edit';
  if (a === 'view') return 'view';
  return 'none';
};

const sanitizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return [];
  return permissions
    .filter((perm) => perm && perm.resource)
    .map((perm) => ({
      resource: String(perm.resource).trim(),
      action: PERMISSION_ACTIONS.includes(perm.action) ? perm.action : normalizeAction(perm.action)
    }))
    .filter((perm) => perm.resource);
};

/**
 * Get permissions from a Role document or Role id.
 * @param {Object|ObjectId} roleOrId - Populated role doc ({ _id, name, permissions, ... }) or Role _id
 */
const getPermissionsForRole = async (roleOrId) => {
  if (!roleOrId) return [];
  if (typeof roleOrId === 'object' && roleOrId.permissions) {
    return sanitizePermissions(roleOrId.permissions);
  }
  const roleId = roleOrId._id || roleOrId;
  const role = await Role.findById(roleId).lean();
  if (!role) return [];
  return sanitizePermissions(role.permissions);
};

const getPermissionsForUser = async (userLike) => {
  if (!userLike || !userLike.role) return [];
  return getPermissionsForRole(userLike.role);
};

const hasPermission = (permissions, resource, action) => {
  const list = sanitizePermissions(permissions);
  if (!resource || !action) return false;

  const perm = list.find((p) => p.resource === resource);
  if (!perm || perm.action === 'none') return false;
  if (perm.action === 'edit') return true;
  if (perm.action === 'view') return action === 'view';
  return false;
};

module.exports = {
  OWNER_ROLE_RESOURCES,
  PERMISSION_ACTIONS,
  DEFAULT_ROLE_NAME,
  DEFAULT_ROLE_PERMISSIONS,
  getOwnerPermissions,
  getDefaultRolePermissions,
  getDefaultRoleId,
  getPermissionsForRole,
  getPermissionsForUser,
  hasPermission
};

