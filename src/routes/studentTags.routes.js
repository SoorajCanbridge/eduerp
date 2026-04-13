const express = require('express');
const { body } = require('express-validator');
const {
  getAllStudentTags,
  getStudentTagById,
  createStudentTag,
  updateStudentTag,
  deleteStudentTag
} = require('../controllers/studentTag.controller');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

const createValidators = [
  body('name')
    .isLength({ min: 1 })
    .withMessage('Name is required')
    .trim(),
  body('description').optional().trim(),
  body('color').optional().trim()
];

const updateValidators = [
  body('name')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Name cannot be empty')
    .trim(),
  body('description').optional().trim(),
  body('color').optional().trim()
];

router.use(auth);

router.get('/', requirePermission('students', 'view'), getAllStudentTags);
router.get('/:id', requirePermission('students', 'view'), getStudentTagById);
router.post('/', requirePermission('students', 'edit'), createValidators, createStudentTag);
router.put('/:id', requirePermission('students', 'edit'), updateValidators, updateStudentTag);
router.delete('/:id', requirePermission('students', 'edit'), deleteStudentTag);

module.exports = router;
