const express = require('express');
const { body } = require('express-validator');
const {
  getAllStudentCategories,
  getStudentCategoryById,
  createStudentCategory,
  updateStudentCategory,
  deleteStudentCategory
} = require('../controllers/studentCategory.controller');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

const createValidators = [
  body('name')
    .isLength({ min: 1 })
    .withMessage('Name is required')
    .trim(),
  body('description').optional().trim()
];

const updateValidators = [
  body('name')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Name cannot be empty')
    .trim(),
  body('description').optional().trim()
];

router.use(auth);

router.get('/', requirePermission('students', 'view'), getAllStudentCategories);
router.get('/:id', requirePermission('students', 'view'), getStudentCategoryById);
router.post('/', requirePermission('students', 'edit'), createValidators, createStudentCategory);
router.put('/:id', requirePermission('students', 'edit'), updateValidators, updateStudentCategory);
router.delete('/:id', requirePermission('students', 'edit'), deleteStudentCategory);

module.exports = router;
