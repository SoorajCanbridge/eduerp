const express = require('express');
const { body, query } = require('express-validator');
const {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole
} = require('../controllers/roles.controller');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

const permissionValidators = [
  body('permissions')
    .optional()
    .isArray()
    .withMessage('permissions must be an array'),
  body('permissions.*.resource')
    .optional()
    .isString()
    .trim()
    .withMessage('permission.resource must be a string'),
  body('permissions.*.action')
    .optional()
    .isIn(['view', 'edit', 'none'])
    .withMessage('permission.action must be view, edit, or none')
];

const createValidators = [
  body('name')
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters')
    .trim(),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim(),
  ...permissionValidators
];

const updateValidators = [
  body('name')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters')
    .trim(),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim(),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID'),
  ...permissionValidators
];

const listValidators = [
  query('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID')
];

router.use(auth);

router.get('/', requirePermission('team', 'view'), listValidators, getAllRoles);
router.get('/:id', requirePermission('team', 'view'), getRoleById);
router.post('/', requirePermission('team', 'edit'), createValidators, createRole);
router.put('/:id', requirePermission('team', 'edit'), updateValidators, updateRole);
router.delete('/:id', requirePermission('team', 'edit'), deleteRole);

module.exports = router;

