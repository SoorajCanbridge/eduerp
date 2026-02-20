const express = require('express');
const { body } = require('express-validator');
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/users.controller');
const auth = require('../middleware/auth');

const router = express.Router();
const roleOptions = ['admin', 'editor', 'viewer'];

const createValidators = [
  body('name').isLength({ min: 2 }).withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('role')
    .optional()
    .isIn(roleOptions)
    .withMessage('Invalid role supplied')
];

const updateValidators = [
  body('name').optional().isLength({ min: 2 }),
  body('email').optional().isEmail(),
  body('password').optional().isLength({ min: 6 }),
  body('role').optional().isIn(roleOptions)
];

router.use(auth);

router.get('/', getAllUsers);
router.get('/:id', getUserById);
router.post('/', createValidators, createUser);
router.put('/:id', updateValidators, updateUser);
router.delete('/:id', deleteUser);

module.exports = router;

