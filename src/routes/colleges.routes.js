const express = require('express');
const { body } = require('express-validator');
const {
  getAllColleges,
  getCollegeById,
  createCollege,
  updateCollege,
  deleteCollege,
  uploadLogo
} = require('../controllers/colleges.controller');
const auth = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

const createValidators = [
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

const updateValidators = [
  body('name')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters'),
  body('code')
    .optional()
    .isLength({ min: 1 })
    .withMessage('College code is required'),
  body('address')
    .optional()
    .isLength({ min: 5 })
    .withMessage('Address must be at least 5 characters'),
  body('city')
    .optional()
    .isLength({ min: 2 }),
  body('state')
    .optional()
    .isLength({ min: 2 }),
  body('pincode')
    .optional()
    .matches(/^[0-9]{6}$/)
    .withMessage('Pincode must be 6 digits'),
  body('phone')
    .optional()
    .isLength({ min: 10 }),
  body('email')
    .optional()
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

router.get('/', getAllColleges);
router.get('/:id', getCollegeById);
router.post('/', createValidators, createCollege);
router.put('/:id', updateValidators, updateCollege);
router.delete('/:id', deleteCollege);
router.post('/:id/logo', uploadSingle('logo'), uploadLogo);

module.exports = router;

