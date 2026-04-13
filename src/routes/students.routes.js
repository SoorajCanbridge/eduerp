const express = require('express');
const { body } = require('express-validator');
const {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentsByCourse,
  getStudentsByCategory,
  getStudentsByTag,
  getStudentsByCollege,
  getStudentStats,
  bulkUpdateActiveStatus
} = require('../controllers/students.controller');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

const enrollmentStatuses = ['enrolled', 'graduated', 'dropped', 'suspended', 'transferred'];
const genders = ['male', 'female', 'other'];

// Validation rules for creating a student
const createValidators = [
  body('name')
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long')
    .trim(),
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .trim(),
  body('dateOfBirth')
    .isISO8601()
    .withMessage('Valid date of birth is required')
    .custom((value) => {
      const birthDate = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < 5 || age > 100) {
        throw new Error('Date of birth must be valid (age between 5 and 100)');
      }
      return true;
    }),
  body('gender')
    .isIn(genders)
    .withMessage('Gender must be one of: male, female, other'),
  body('address.city')
    .notEmpty()
    .withMessage('City is required')
    .trim(),
  body('address.state')
    .notEmpty()
    .withMessage('State is required')
    .trim(),
  body('address.pincode')
    .matches(/^[0-9]{6}$/)
    .withMessage('Pincode must be 6 digits'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('Valid college ID is required'),
  body('course')
    .isMongoId()
    .withMessage('Valid course ID is required'),
  body('categoryId')
    .optional()
    .isMongoId()
    .withMessage('Valid student category ID is required'),
  body('category')
    .optional()
    .isMongoId()
    .withMessage('Valid student category ID is required'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('tags must be an array'),
  body('tags.*')
    .isMongoId()
    .withMessage('Each tag must be a valid ID'),
  body('tagIds')
    .optional()
    .isArray()
    .withMessage('tagIds must be an array'),
  body('tagIds.*')
    .isMongoId()
    .withMessage('Each tag ID must be valid'),
  body('tagId')
    .optional()
    .isMongoId()
    .withMessage('Valid student tag ID is required'),
  body('tag')
    .optional()
    .isMongoId()
    .withMessage('Valid student tag ID is required'),
  body('enrollmentDate')
    .optional()
    .isISO8601()
    .withMessage('Valid enrollment date is required'),
  body('enrollmentStatus')
    .optional()
    .isIn(enrollmentStatuses)
    .withMessage('Invalid enrollment status'),
  body('studentId')
    .optional()
    .trim()
    .isLength({ min: 3 })
    .withMessage('Student ID must be at least 3 characters'),
  body('rollNumber')
    .optional()
    .trim(),
  body('alternatePhone')
    .optional()
    .trim(),
  body('address.street')
    .optional()
    .trim(),
  body('address.country')
    .optional()
    .trim(),
  body('guardianInfo.name')
    .optional()
    .trim(),
  body('guardianInfo.relation')
    .optional()
    .trim(),
  body('guardianInfo.phone')
    .optional()
    .trim(),
  body('guardianInfo.email')
    .optional()
    .isEmail()
    .withMessage('Valid guardian email is required')
    .normalizeEmail(),
  body('academicRecords.currentSemester')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Current semester must be a positive integer'),
  body('academicRecords.cgpa')
    .optional()
    .isFloat({ min: 0, max: 10 })
    .withMessage('CGPA must be between 0 and 10'),
  body('academicRecords.attendance')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Attendance must be between 0 and 100'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('image')
    .optional()
    .trim()
    .isString()
    .withMessage('Image must be a valid path string')
];

// Validation rules for updating a student
const updateValidators = [
  body('name')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long')
    .trim(),
  body('studentId')
    .optional()
    .trim()
    .isLength({ min: 3 })
    .withMessage('Student ID must be at least 3 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('phone')
    .optional()
    .notEmpty()
    .withMessage('Phone number cannot be empty')
    .trim(),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Valid date of birth is required')
    .custom((value) => {
      if (value) {
        const birthDate = new Date(value);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        if (age < 5 || age > 100) {
          throw new Error('Date of birth must be valid (age between 5 and 100)');
        }
      }
      return true;
    }),
  body('gender')
    .optional()
    .isIn(genders)
    .withMessage('Gender must be one of: male, female, other'),
  body('image')
    .optional()
    .trim()
    .isString()
    .withMessage('Image must be a valid path string'),
  body('address.city')
    .optional()
    .notEmpty()
    .withMessage('City cannot be empty')
    .trim(),
  body('address.state')
    .optional()
    .notEmpty()
    .withMessage('State cannot be empty')
    .trim(),
  body('address.pincode')
    .optional()
    .matches(/^[0-9]{6}$/)
    .withMessage('Pincode must be 6 digits'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('Valid college ID is required'),
  body('course')
    .optional()
    .isMongoId()
    .withMessage('Valid course ID is required'),
  body('categoryId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('Valid student category ID is required'),
  body('category')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('Valid student category ID is required'),
  body('tags')
    .optional({ nullable: true })
    .custom((v) => v === null || Array.isArray(v))
    .withMessage('tags must be an array'),
  body('tags.*')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('Each tag must be a valid ID'),
  body('tagIds')
    .optional({ nullable: true })
    .custom((v) => v === null || Array.isArray(v))
    .withMessage('tagIds must be an array'),
  body('tagIds.*')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('Each tag ID must be valid'),
  body('tagId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('Valid student tag ID is required'),
  body('tag')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('Valid student tag ID is required'),
  body('enrollmentDate')
    .optional()
    .isISO8601()
    .withMessage('Valid enrollment date is required'),
  body('enrollmentStatus')
    .optional()
    .isIn(enrollmentStatuses)
    .withMessage('Invalid enrollment status'),
  body('graduationDate')
    .optional()
    .isISO8601()
    .withMessage('Valid graduation date is required'),
  body('rollNumber')
    .optional()
    .trim(),
  body('alternatePhone')
    .optional()
    .trim(),
  body('guardianInfo.name')
    .optional()
    .trim(),
  body('guardianInfo.relation')
    .optional()
    .trim(),
  body('guardianInfo.phone')
    .optional()
    .trim(),
  body('guardianInfo.email')
    .optional()
    .isEmail()
    .withMessage('Valid guardian email is required')
    .normalizeEmail(),
  body('academicRecords.currentSemester')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Current semester must be a positive integer'),
  body('academicRecords.cgpa')
    .optional()
    .isFloat({ min: 0, max: 10 })
    .withMessage('CGPA must be between 0 and 10'),
  body('academicRecords.attendance')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Attendance must be between 0 and 100'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// Validation rules for bulk active status update
const bulkUpdateActiveStatusValidators = [
  body('students')
    .isArray({ min: 1 })
    .withMessage('students must be a non-empty array'),
  body('students.*.studentId')
    .notEmpty()
    .isMongoId()
    .withMessage('Each student must have a valid MongoDB ObjectId'),
  body('students.*.isActive')
    .isBoolean()
    .withMessage('isActive must be a boolean for each student')
];

// Apply authentication middleware to all routes
router.use(auth);

// Main CRUD routes
router.get('/', requirePermission('students', 'view'), getAllStudents);
router.get('/stats', requirePermission('students', 'view'), getStudentStats);
router.get('/course/:courseId', requirePermission('students', 'view'), getStudentsByCourse);
router.get('/college/:collegeId', requirePermission('students', 'view'), getStudentsByCollege);
router.get('/category/:categoryId', requirePermission('students', 'view'), getStudentsByCategory);
router.get('/tag/:tagId', requirePermission('students', 'view'), getStudentsByTag);
router.get('/:id', requirePermission('students', 'view'), getStudentById);
router.post('/', requirePermission('students', 'edit'), createValidators, createStudent);
router.put('/:id', requirePermission('students', 'edit'), updateValidators, updateStudent);
router.delete('/:id', requirePermission('students', 'edit'), deleteStudent);

// Bulk update active status
router.put(
  '/bulk/active-status',
  requirePermission('students', 'edit'),
  bulkUpdateActiveStatusValidators,
  bulkUpdateActiveStatus
);

module.exports = router;

