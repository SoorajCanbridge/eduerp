const express = require('express');
const { body, validationResult } = require('express-validator');
const { createClient, getClients, getClientById } = require('../controllers/users.controller');
const { createCollegeForClient } = require('../controllers/colleges.controller');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }
  next();
};

const createClientValidators = [
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

const createCollegeValidators = [
  body('name')
    .isLength({ min: 2 })
    .withMessage('Name is required and must be at least 2 characters'),
  body('code')
    .isLength({ min: 1 })
    .withMessage('College code is required'),
  body('address')
    .isLength({ min: 5 })
    .withMessage('Address is required and must be at least 5 characters'),
  body('city')
    .isLength({ min: 2 })
    .withMessage('City is required'),
  body('state')
    .isLength({ min: 2 })
    .withMessage('State is required'),
  body('pincode')
    .matches(/^[0-9]{6}$/)
    .withMessage('Pincode must be 6 digits'),
  body('phone')
    .isLength({ min: 10 })
    .withMessage('Phone number is required'),
  body('email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Website must be a valid URL'),
  body('establishedYear')
    .optional()
    .isInt({ min: 1800, max: new Date().getFullYear() })
    .withMessage('Established year must be a valid year')
];

router.use(auth);
// Controller decides whether to show only own clients or owner-created clients.
router.get('/', getClients);
router.get('/:id', getClientById);
router.post('/', requirePermission('startup', 'edit'), createClientValidators, validate, createClient);
router.post('/college', requirePermission('startup', 'edit'), createCollegeValidators, validate, createCollegeForClient);

module.exports = router;
