const express = require('express');
const { body, query } = require('express-validator');
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/users.controller');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

const listValidators = [
  query('role').optional().isMongoId().withMessage('Role must be a valid Mongo ID'),
  query('isActive').optional().isIn(['true', 'false']).withMessage('isActive must be true or false'),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['name', 'email', 'role', 'createdAt', 'updatedAt', 'lastLoginAt'])
    .withMessage('Invalid sortBy field'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('order must be asc or desc')
];

const createValidators = [
  body('name').isLength({ min: 2 }).withMessage('Name must be at least 2 characters').trim(),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('phone').optional().trim(),
  body('role')
    .optional({ values: 'null' })
    .isMongoId()
    .withMessage('Role must be a valid Mongo ID'),
  body('college').optional().isMongoId().withMessage('College must be a valid Mongo ID'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

const updateValidators = [
  body('name').optional().isLength({ min: 2 }).withMessage('Name must be at least 2 characters').trim(),
  body('email').optional().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional().trim(),
  body('role')
    .optional({ values: 'null' })
    .isMongoId()
    .withMessage('Role must be a valid Mongo ID'),
  body('college').optional().isMongoId().withMessage('College must be a valid Mongo ID'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

router.use(auth);

router.get('/', requirePermission('team', 'view'), listValidators, getAllUsers);
router.get('/:id', requirePermission('team', 'view'), getUserById);
router.post('/', requirePermission('team', 'edit'), createValidators, createUser);
router.put('/:id', requirePermission('team', 'edit'), updateValidators, updateUser);
router.delete('/:id', requirePermission('team', 'edit'), deleteUser);

module.exports = router;
