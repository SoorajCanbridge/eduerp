const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  getProfile,
  logout
} = require('../controllers/auth.controller');
const auth = require('../middleware/auth');

const router = express.Router();

router.post(
  '/register',
  [
    body('name').isLength({ min: 2 }).withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('role')
      .optional()
      .isIn(['admin', 'editor', 'viewer','user'])
      .withMessage('Invalid role supplied')
  ],
  register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  login
);

router.get('/me', auth, getProfile);
router.post('/logout', auth, logout);

module.exports = router;

