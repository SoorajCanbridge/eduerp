const express = require('express');
const { body } = require('express-validator');
const {
  getAllTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getTeachersByDepartment,
  getTeachersByCollege,
  getTeachersByCourse,
  getTeacherStats,
  // attendance
  getTeacherAttendances,
  getTeacherAttendanceById,
  createTeacherAttendance,
  createMassTeacherAttendance,
  updateTeacherAttendance,
  deleteTeacherAttendance,
  getTeacherAttendanceSummary,
  validateTeacherAttendance,
  checkInAttendance,
  checkOutAttendance,
  approveTeacherAttendance,
  rejectTeacherAttendance,
  regularizeTeacherAttendance,
  // payroll
  getPayrolls,
  getPayrollById,
  generatePayroll,
  updatePayroll,
  deletePayroll,
  processPayrollPayment,
  // payroll advanced features
  approvePayroll,
  rejectPayroll,
  reversePayroll,
  holdPayroll,
  unholdPayroll,
  addPaymentSplit,
  updatePaymentSplit,
  getPayrollYTD,
  generatePaySlip,
  markPaySlipSent
} = require('../controllers/teachers.controller');
const auth = require('../middleware/auth');

const router = express.Router();

const employmentStatuses = ['active', 'on-leave', 'resigned', 'retired', 'terminated'];
const staffTypes = ['teaching', 'non-teaching'];
const teachingDesignations = ['professor', 'associate-professor', 'assistant-professor', 'lecturer', 'visiting-faculty', 'guest-faculty'];
const nonTeachingDesignations = ['principal', 'vice-principal', 'registrar', 'admin-officer', 'accountant', 'clerk', 'librarian', 'lab-technician', 'lab-assistant', 'peon', 'security-guard', 'maintenance-staff', 'canteen-staff', 'driver', 'nurse', 'counselor', 'it-support', 'hr-officer', 'store-keeper', 'other'];
const allDesignations = [...teachingDesignations, ...nonTeachingDesignations];
const genders = ['male', 'female', 'other'];
const shifts = ['day', 'night', 'general'];
const attendanceStatuses = [
  'present',
  'absent',
  'half-day',
  'leave',
  'holiday',
  'late',
  'early-leave',
  'on-duty',
  'work-from-home',
  'comp-off',
  'weekend',
  'training',
  'meeting',
  'conference',
  'sabbatical',
  'suspension',
  'medical-emergency'
];
const leaveTypes = ['casual', 'sick', 'earned', 'unpaid', 'maternity', 'paternity', 'compensatory', 'sabbatical', 'other'];
const payrollStatuses = ['draft', 'pending', 'approved', 'paid', 'cancelled', 'on-hold', 'reversed'];
const paymentMethods = ['cash', 'bank-transfer', 'upi', 'cheque', 'other', 'neft', 'rtgs', 'imps'];

// Validation rules for creating a teacher
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
      if (age < 22 || age > 100) {
        throw new Error('Date of birth must be valid (age between 22 and 100)');
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
  body('staffType')
    .optional()
    .isIn(staffTypes)
    .withMessage('Staff type must be either teaching or non-teaching'),
  body('department')
    .notEmpty()
    .withMessage('Department is required')
    .trim(),
  body('designation')
    .isIn(allDesignations)
    .withMessage('Invalid designation'),
  body('role')
    .optional()
    .trim(),
  body('office')
    .optional()
    .trim(),
  body('workLocation')
    .optional()
    .trim(),
  body('shift')
    .optional()
    .isIn(shifts)
    .withMessage('Shift must be day, night, or general'),
  body('reportingTo')
    .optional()
    .isMongoId()
    .withMessage('Reporting manager must be a valid Mongo ID'),
  body('specialization')
    .optional()
    .isArray()
    .withMessage('Specialization must be an array'),
  body('specialization.*')
    .optional()
    .trim(),
  body('qualifications')
    .optional()
    .isArray()
    .withMessage('Qualifications must be an array'),
  body('qualifications.*.degree')
    .optional()
    .trim(),
  body('qualifications.*.institution')
    .optional()
    .trim(),
  body('qualifications.*.year')
    .optional()
    .isInt({ min: 1950, max: new Date().getFullYear() })
    .withMessage('Year must be between 1950 and current year'),
  body('qualifications.*.percentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Percentage must be between 0 and 100'),
  body('experience.totalYears')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total years of experience must be a positive number'),
  body('experience.teachingYears')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Teaching years must be a positive number'),
  body('experience.industryYears')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Industry years must be a positive number'),
  body('experience.administrativeYears')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Administrative years must be a positive number'),
  body('courses')
    .optional()
    .isArray()
    .withMessage('Courses must be an array')
    .custom((value, { req }) => {
      // Courses should only be allowed for teaching staff
      if (value && value.length > 0 && req.body.staffType === 'non-teaching') {
        throw new Error('Courses cannot be assigned to non-teaching staff');
      }
      return true;
    }),
  body('courses.*')
    .optional()
    .isMongoId()
    .withMessage('Each course must be a valid MongoDB ID'),
  body('joiningDate')
    .optional()
    .isISO8601()
    .withMessage('Valid joining date is required'),
  body('employmentStatus')
    .optional()
    .isIn(employmentStatuses)
    .withMessage('Invalid employment status'),
  body('salary')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Salary must be a positive number'),
  body('employeeId')
    .optional()
    .trim()
    .isLength({ min: 3 })
    .withMessage('Employee ID must be at least 3 characters'),
  body('alternatePhone')
    .optional()
    .trim(),
  body('address.street')
    .optional()
    .trim(),
  body('address.country')
    .optional()
    .trim(),
  body('documents.aadhar')
    .optional()
    .trim(),
  body('documents.pan')
    .optional()
    .trim(),
  body('documents.certificates')
    .optional()
    .isArray()
    .withMessage('Certificates must be an array'),
  body('documents.certificates.*')
    .optional()
    .trim(),
  body('emergencyContact.name')
    .optional()
    .trim(),
  body('emergencyContact.relation')
    .optional()
    .trim(),
  body('emergencyContact.phone')
    .optional()
    .trim(),
  body('emergencyContact.email')
    .optional()
    .isEmail()
    .withMessage('Valid emergency contact email is required')
    .normalizeEmail(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// Validation rules for updating a teacher
const updateValidators = [
  body('name')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long')
    .trim(),
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
        if (age < 22 || age > 100) {
          throw new Error('Date of birth must be valid (age between 22 and 100)');
        }
      }
      return true;
    }),
  body('gender')
    .optional()
    .isIn(genders)
    .withMessage('Gender must be one of: male, female, other'),
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
  body('staffType')
    .optional()
    .isIn(staffTypes)
    .withMessage('Staff type must be either teaching or non-teaching'),
  body('department')
    .optional()
    .notEmpty()
    .withMessage('Department cannot be empty')
    .trim(),
  body('designation')
    .optional()
    .isIn(allDesignations)
    .withMessage('Invalid designation'),
  body('role')
    .optional()
    .trim(),
  body('office')
    .optional()
    .trim(),
  body('workLocation')
    .optional()
    .trim(),
  body('shift')
    .optional()
    .isIn(shifts)
    .withMessage('Shift must be day, night, or general'),
  body('reportingTo')
    .optional()
    .isMongoId()
    .withMessage('Reporting manager must be a valid Mongo ID'),
  body('specialization')
    .optional()
    .isArray()
    .withMessage('Specialization must be an array'),
  body('specialization.*')
    .optional()
    .trim(),
  body('qualifications')
    .optional()
    .isArray()
    .withMessage('Qualifications must be an array'),
  body('qualifications.*.degree')
    .optional()
    .trim(),
  body('qualifications.*.institution')
    .optional()
    .trim(),
  body('qualifications.*.year')
    .optional()
    .isInt({ min: 1950, max: new Date().getFullYear() })
    .withMessage('Year must be between 1950 and current year'),
  body('qualifications.*.percentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Percentage must be between 0 and 100'),
  body('experience.totalYears')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total years of experience must be a positive number'),
  body('experience.teachingYears')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Teaching years must be a positive number'),
  body('experience.industryYears')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Industry years must be a positive number'),
  body('experience.administrativeYears')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Administrative years must be a positive number'),
  body('courses')
    .optional()
    .isArray()
    .withMessage('Courses must be an array')
    .custom((value, { req }) => {
      // Courses should only be allowed for teaching staff
      if (value && value.length > 0) {
        // If staffType is being updated to non-teaching, don't allow courses
        if (req.body.staffType === 'non-teaching') {
          throw new Error('Courses cannot be assigned to non-teaching staff');
        }
      }
      return true;
    }),
  body('courses.*')
    .optional()
    .isMongoId()
    .withMessage('Each course must be a valid MongoDB ID'),
  body('joiningDate')
    .optional()
    .isISO8601()
    .withMessage('Valid joining date is required'),
  body('employmentStatus')
    .optional()
    .isIn(employmentStatuses)
    .withMessage('Invalid employment status'),
  body('salary')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Salary must be a positive number'),
  body('alternatePhone')
    .optional()
    .trim(),
  body('address.street')
    .optional()
    .trim(),
  body('address.country')
    .optional()
    .trim(),
  body('documents.aadhar')
    .optional()
    .trim(),
  body('documents.pan')
    .optional()
    .trim(),
  body('documents.certificates')
    .optional()
    .isArray()
    .withMessage('Certificates must be an array'),
  body('documents.certificates.*')
    .optional()
    .trim(),
  body('emergencyContact.name')
    .optional()
    .trim(),
  body('emergencyContact.relation')
    .optional()
    .trim(),
  body('emergencyContact.phone')
    .optional()
    .trim(),
  body('emergencyContact.email')
    .optional()
    .isEmail()
    .withMessage('Valid emergency contact email is required')
    .normalizeEmail(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// Apply authentication middleware to all routes
router.use(auth);

// ATTENDANCE validators
const attendanceCreateValidators = [
  body('teacher')
    .isMongoId()
    .withMessage('Teacher must be a valid Mongo ID'),
  body('date')
    .isISO8601()
    .withMessage('Date must be a valid ISO date'),
  body('status')
    .isIn(attendanceStatuses)
    .withMessage('Status must be a valid attendance status'),
  body('checkIn')
    .optional()
    .isISO8601()
    .withMessage('Check-in time must be a valid ISO date'),
  body('checkOut')
    .optional()
    .isISO8601()
    .withMessage('Check-out time must be a valid ISO date'),
  body('leaveType')
    .optional()
    .isIn(leaveTypes)
    .withMessage('Leave type must be a valid type'),
  body('remarks')
    .optional()
    .trim(),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID')
];

const attendanceUpdateValidators = [
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date'),
  body('status')
    .optional()
    .isIn(attendanceStatuses)
    .withMessage('Status must be a valid attendance status'),
  body('checkIn')
    .optional()
    .isISO8601()
    .withMessage('Check-in time must be a valid ISO date'),
  body('checkOut')
    .optional()
    .isISO8601()
    .withMessage('Check-out time must be a valid ISO date'),
  body('workingHours')
    .optional()
    .isFloat({ min: 0, max: 24 })
    .withMessage('Working hours must be between 0 and 24'),
  body('leaveType')
    .optional()
    .isIn(leaveTypes)
    .withMessage('Leave type must be a valid type'),
  body('remarks')
    .optional()
    .trim()
];

const massAttendanceValidators = [
  body('teachers')
    .isArray({ min: 1 })
    .withMessage('Teachers must be a non-empty array'),
  body('teachers.*')
    .isMongoId()
    .withMessage('Each teacher must be a valid Mongo ID'),
  body('dates')
    .isArray({ min: 1 })
    .withMessage('Dates must be a non-empty array'),
  body('dates.*')
    .isISO8601()
    .withMessage('Each date must be a valid ISO date'),
  body('commonData')
    .optional()
    .isObject()
    .withMessage('Common data must be an object'),
  body('commonData.status')
    .optional()
    .isIn(attendanceStatuses)
    .withMessage('Status must be a valid attendance status'),
  body('commonData.college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID'),
  body('perTeacherData')
    .optional()
    .isArray()
    .withMessage('Per teacher data must be an array'),
  body('perTeacherData.*.teacherId')
    .optional()
    .isMongoId()
    .withMessage('Teacher ID in per teacher data must be a valid Mongo ID'),
  body('perDateData')
    .optional()
    .isArray()
    .withMessage('Per date data must be an array'),
  body('perDateData.*.date')
    .optional()
    .isISO8601()
    .withMessage('Date in per date data must be a valid ISO date')
];

// PAYROLL validators
const payrollGenerateValidators = [
  body('teacherId')
    .isMongoId()
    .withMessage('Teacher ID must be a valid Mongo ID'),
  body('month')
    .isInt({ min: 1, max: 12 })
    .withMessage('Month must be between 1 and 12'),
  body('year')
    .isInt({ min: 2000 })
    .withMessage('Year must be a valid year'),
  body('items')
    .optional()
    .isArray()
    .withMessage('Items must be an array'),
  body('items.*.description')
    .optional()
    .trim(),
  body('items.*.amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item amount must be a positive number'),
  body('items.*.type')
    .optional()
    .isIn(['allowance', 'deduction'])
    .withMessage('Item type must be allowance or deduction'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID')
];

const payrollUpdateValidators = [
  body('status')
    .optional()
    .isIn(payrollStatuses)
    .withMessage('Status must be a valid payroll status'),
  body('items')
    .optional()
    .isArray()
    .withMessage('Items must be an array'),
  body('baseSalary')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Base salary must be a positive number'),
  body('paymentDate')
    .optional()
    .isISO8601()
    .withMessage('Payment date must be a valid ISO date'),
  body('paymentMethod')
    .optional()
    .isIn(paymentMethods)
    .withMessage('Payment method must be a valid method'),
  body('account')
    .optional()
    .isMongoId()
    .withMessage('Account must be a valid Mongo ID'),
  body('transactionReference')
    .optional()
    .trim(),
  body('notes')
    .optional()
    .trim()
];

const payrollPaymentValidators = [
  body('accountId')
    .optional()
    .isMongoId()
    .withMessage('Account ID must be a valid Mongo ID'),
  body('paymentDate')
    .optional()
    .isISO8601()
    .withMessage('Payment date must be a valid ISO date'),
  body('paymentMethod')
    .optional()
    .isIn(paymentMethods)
    .withMessage('Payment method must be a valid method'),
  body('transactionReference')
    .optional()
    .trim(),
  body('useSplits')
    .optional()
    .isBoolean()
    .withMessage('useSplits must be a boolean')
];

// ATTENDANCE routes (must be before /:id route to avoid route conflicts)
router.get('/attendance', getTeacherAttendances);
router.get('/attendance/summary', getTeacherAttendanceSummary);
router.get('/attendance/:id', getTeacherAttendanceById);
router.post('/attendance', attendanceCreateValidators, createTeacherAttendance);
router.post('/attendance/mass', massAttendanceValidators, createMassTeacherAttendance);
router.put('/attendance/:id', attendanceUpdateValidators, updateTeacherAttendance);
router.delete('/attendance/:id', deleteTeacherAttendance);
router.post('/attendance/:id/validate', validateTeacherAttendance);
router.post('/attendance/:id/check-in', checkInAttendance);
router.post('/attendance/:id/check-out', checkOutAttendance);
router.post('/attendance/:id/approve', approveTeacherAttendance);
router.post('/attendance/:id/reject', [
  body('reason')
    .notEmpty()
    .withMessage('Rejection reason is required')
    .trim()
], rejectTeacherAttendance);
router.post('/attendance/:id/regularize', [
  body('reason')
    .notEmpty()
    .withMessage('Regularization reason is required')
    .trim()
], regularizeTeacherAttendance);

// PAYROLL routes (must be before /:id route to avoid route conflicts)
router.get('/payroll', getPayrolls);
router.get('/payroll/ytd', getPayrollYTD);
router.get('/payroll/:id', getPayrollById);
router.post('/payroll/generate', payrollGenerateValidators, generatePayroll);
router.put('/payroll/:id', payrollUpdateValidators, updatePayroll);
router.post('/payroll/:id/pay', payrollPaymentValidators, processPayrollPayment);
router.delete('/payroll/:id', deletePayroll);
// Payroll approval workflow
router.post('/payroll/:id/approve', [
  body('comments').optional().trim(),
  body('level').optional().isInt({ min: 1 }).withMessage('Level must be a positive integer')
], approvePayroll);
router.post('/payroll/:id/reject', [
  body('comments').notEmpty().withMessage('Rejection reason is required').trim(),
  body('level').optional().isInt({ min: 1 }).withMessage('Level must be a positive integer')
], rejectPayroll);
// Payroll reversal
router.post('/payroll/:id/reverse', [
  body('reason').optional().trim()
], reversePayroll);
// Payroll hold/unhold
router.post('/payroll/:id/hold', [
  body('reason').optional().trim(),
  body('holdFrom').optional().isISO8601().withMessage('Hold from date must be a valid ISO date'),
  body('holdTo').optional().isISO8601().withMessage('Hold to date must be a valid ISO date')
], holdPayroll);
router.post('/payroll/:id/unhold', unholdPayroll);
// Payment splits
router.post('/payroll/:id/payment-split', [
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('paymentDate').isISO8601().withMessage('Payment date must be a valid ISO date'),
  body('paymentMethod').optional().isIn(paymentMethods).withMessage('Payment method must be valid'),
  body('account').optional().isMongoId().withMessage('Account must be a valid Mongo ID'),
  body('transactionReference').optional().trim()
], addPaymentSplit);
router.put('/payroll/:id/payment-split/:splitId', [
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('paymentDate').optional().isISO8601().withMessage('Payment date must be a valid ISO date'),
  body('paymentMethod').optional().isIn(paymentMethods).withMessage('Payment method must be valid'),
  body('account').optional().isMongoId().withMessage('Account must be a valid Mongo ID'),
  body('transactionReference').optional().trim(),
  body('status').optional().isIn(['pending', 'paid', 'failed', 'cancelled']).withMessage('Status must be valid')
], updatePaymentSplit);
// Pay slip
router.post('/payroll/:id/payslip/generate', generatePaySlip);
router.post('/payroll/:id/payslip/sent', [
  body('sentTo').optional().trim()
], markPaySlipSent);

// Main CRUD routes (/:id must be last to avoid conflicts with specific routes)
router.get('/', getAllTeachers);
router.get('/stats', getTeacherStats);
router.get('/department/:department', getTeachersByDepartment);
router.get('/college/:collegeId', getTeachersByCollege);
router.get('/course/:courseId', getTeachersByCourse);
router.get('/:id', getTeacherById);
router.post('/', createValidators, createTeacher);
router.put('/:id', updateValidators, updateTeacher);
router.delete('/:id', deleteTeacher);

module.exports = router;

