const { validationResult } = require('express-validator');
const Teacher = require('../models/teacher.model');
const College = require('../models/college.model');
const AcademicCourse = require('../models/academicCourse.model');
const TeacherAttendance = require('../models/teacherAttendance.model');
const Payroll = require('../models/payroll.model');
const Expense = require('../models/expense.model');
const FinanceCategory = require('../models/financeCategory.model');
const Account = require('../models/account.model');
const Ledger = require('../models/ledger.model');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

const getAllTeachers = async (req, res, next) => {
  try {
    const filters = {};
    const query = req.query;

    // Filter by college
    if (query.collegeId) {
      filters.college = query.collegeId;
    } else if (req.user.college) {
      // If user has a college, filter by it
      filters.college = req.user.college;
    }

    // Filter by department
    if (query.department) {
      filters.department = { $regex: query.department, $options: 'i' };
    }

    // Filter by staff type
    if (query.staffType) {
      filters.staffType = query.staffType;
    }

    // Filter by designation
    if (query.designation) {
      filters.designation = query.designation;
    }

    // Filter by employment status
    if (query.employmentStatus) {
      filters.employmentStatus = query.employmentStatus;
    }

    // Filter by active status
    if (query.isActive !== undefined) {
      filters.isActive = query.isActive === 'true';
    }

    // Filter by course
    if (query.courseId) {
      filters.courses = query.courseId;
    }

    // Search by name, email, employeeId, phone, or department
    if (query.search) {
      filters.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
        { employeeId: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
        { department: { $regex: query.search, $options: 'i' } }
      ];
    }

    // Pagination
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    // Sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const teachers = await Teacher.find(filters)
      .populate('college', 'name code')
      .populate('courses', 'name batch levelA levelB levelC')
      .populate('reportingTo', 'name employeeId designation')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Teacher.countDocuments(filters);

    res.json({
      success: true,
      data: teachers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getTeacherById = async (req, res, next) => {
  try {
    const teacher = await Teacher.findById(req.params.id)
      .populate('college', 'name code address city state')
      .populate('courses', 'name batch levelA levelB levelC startDate endDate')
      .populate('reportingTo', 'name employeeId designation department')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!teacher) {
      return res
        .status(404)
        .json({ success: false, message: 'Teacher not found' });
    }

    res.json({ success: true, data: teacher });
  } catch (error) {
    next(error);
  }
};

const createTeacher = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    // Generate employeeId if not provided
    let employeeId = req.body.employeeId;
    if (!employeeId) {
      const collegeId = req.body.college || req.user.college;
      const staffType = req.body.staffType || 'teaching';
      let collegeCode = 'GEN';
      if (collegeId) {
        const college = await College.findById(collegeId);
        if (college) {
          collegeCode = college.code;
        }
      }
      const year = new Date().getFullYear().toString().slice(-2);
      const prefix = staffType === 'non-teaching' ? 'NT' : 'T';
      const count = await Teacher.countDocuments({ 
        college: collegeId,
        staffType: staffType 
      });
      employeeId = `${collegeCode}${prefix}${year}${String(count + 1).padStart(4, '0')}`;
    }

    // Verify courses exist if provided (only for teaching staff)
    if (req.body.staffType !== 'non-teaching' && req.body.courses && req.body.courses.length > 0) {
      const courses = await AcademicCourse.find({
        _id: { $in: req.body.courses }
      });
      if (courses.length !== req.body.courses.length) {
        return res
          .status(404)
          .json({ success: false, message: 'One or more courses not found' });
      }
    }

    // Verify reportingTo exists if provided (for non-teaching staff)
    if (req.body.reportingTo) {
      const reportingTo = await Teacher.findById(req.body.reportingTo);
      if (!reportingTo) {
        return res
          .status(404)
          .json({ success: false, message: 'Reporting manager not found' });
      }
    }

    const teacherData = {
      ...req.body,
      employeeId,
      college: req.body.college || req.user.college,
      createdBy: req.user._id
    };

    const teacher = await Teacher.create(teacherData);
    const populatedTeacher = await Teacher.findById(teacher._id)
      .populate('college', 'name code')
      .populate('courses', 'name batch levelA levelB levelC')
      .populate('reportingTo', 'name employeeId designation')
      .populate('createdBy', 'name email');

    res.status(201).json({ success: true, data: populatedTeacher });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(409).json({
        success: false,
        message: `${field === 'employeeId' ? 'Employee ID' : 'Email'} already exists`
      });
    } else {
      next(error);
    }
  }
};

const updateTeacher = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res
        .status(404)
        .json({ success: false, message: 'Teacher not found' });
    }

    // Update fields
    const updatableFields = [
      'name',
      'email',
      'phone',
      'alternatePhone',
      'dateOfBirth',
      'gender',
      'image',
      'address',
      'staffType',
      'department',
      'designation',
      'role',
      'office',
      'workLocation',
      'shift',
      'reportingTo',
      'specialization',
      'qualifications',
      'experience',
      'courses',
      'joiningDate',
      'employmentStatus',
      'salary',
      'documents',
      'emergencyContact',
      'isActive'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'address' && typeof req.body[field] === 'object') {
          teacher[field] = { ...teacher[field], ...req.body[field] };
        } else if (field === 'emergencyContact' && typeof req.body[field] === 'object') {
          teacher[field] = { ...teacher[field], ...req.body[field] };
        } else if (field === 'experience' && typeof req.body[field] === 'object') {
          teacher[field] = { ...teacher[field], ...req.body[field] };
        } else if (field === 'documents' && typeof req.body[field] === 'object') {
          teacher[field] = { ...teacher[field], ...req.body[field] };
        } else if (field === 'specialization' && Array.isArray(req.body[field])) {
          teacher[field] = req.body[field];
        } else if (field === 'qualifications' && Array.isArray(req.body[field])) {
          teacher[field] = req.body[field];
        } else if (field === 'courses' && Array.isArray(req.body[field])) {
          teacher[field] = req.body[field];
        } else {
          teacher[field] = req.body[field];
        }
      }
    });

    teacher.updatedBy = req.user._id;

    // Verify courses exist if being updated (only for teaching staff)
    if (teacher.staffType !== 'non-teaching' && req.body.courses && Array.isArray(req.body.courses) && req.body.courses.length > 0) {
      const courses = await AcademicCourse.find({
        _id: { $in: req.body.courses }
      });
      if (courses.length !== req.body.courses.length) {
        return res
          .status(404)
          .json({ success: false, message: 'One or more courses not found' });
      }
    }

    // Verify reportingTo exists if being updated
    if (req.body.reportingTo) {
      const reportingTo = await Teacher.findById(req.body.reportingTo);
      if (!reportingTo) {
        return res
          .status(404)
          .json({ success: false, message: 'Reporting manager not found' });
      }
    }

    await teacher.save();
    const updatedTeacher = await Teacher.findById(teacher._id)
      .populate('college', 'name code')
      .populate('courses', 'name batch levelA levelB levelC')
      .populate('reportingTo', 'name employeeId designation')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updatedTeacher });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(409).json({
        success: false,
        message: `${field === 'employeeId' ? 'Employee ID' : 'Email'} already exists`
      });
    } else {
      next(error);
    }
  }
};

const deleteTeacher = async (req, res, next) => {
  try {
    const teacher = await Teacher.findByIdAndDelete(req.params.id);
    if (!teacher) {
      return res
        .status(404)
        .json({ success: false, message: 'Teacher not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getTeachersByDepartment = async (req, res, next) => {
  try {
    const department = req.params.department;
    const filters = { department: { $regex: department, $options: 'i' } };

    if (req.query.collegeId) {
      filters.college = req.query.collegeId;
    } else if (req.user.college) {
      filters.college = req.user.college;
    }

    if (req.query.employmentStatus) {
      filters.employmentStatus = req.query.employmentStatus;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
    }

    const teachers = await Teacher.find(filters)
      .populate('college', 'name code')
      .populate('courses', 'name batch')
      .populate('reportingTo', 'name employeeId designation')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: teachers, count: teachers.length });
  } catch (error) {
    next(error);
  }
};

const getTeachersByCollege = async (req, res, next) => {
  try {
    const collegeId = req.params.collegeId;
    const filters = { college: collegeId };

    if (req.query.department) {
      filters.department = { $regex: req.query.department, $options: 'i' };
    }

    if (req.query.designation) {
      filters.designation = req.query.designation;
    }

    if (req.query.employmentStatus) {
      filters.employmentStatus = req.query.employmentStatus;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const teachers = await Teacher.find(filters)
      .populate('college', 'name code')
      .populate('courses', 'name batch levelA levelB levelC')
      .populate('reportingTo', 'name employeeId designation')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Teacher.countDocuments(filters);

    res.json({
      success: true,
      data: teachers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getTeachersByCourse = async (req, res, next) => {
  try {
    const courseId = req.params.courseId;
    const filters = { courses: courseId };

    if (req.query.collegeId) {
      filters.college = req.query.collegeId;
    } else if (req.user.college) {
      filters.college = req.user.college;
    }

    if (req.query.employmentStatus) {
      filters.employmentStatus = req.query.employmentStatus;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
    }

    const teachers = await Teacher.find(filters)
      .populate('college', 'name code')
      .populate('courses', 'name batch')
      .populate('reportingTo', 'name employeeId designation')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: teachers, count: teachers.length });
  } catch (error) {
    next(error);
  }
};

const getTeacherStats = async (req, res, next) => {
  try {
    const filters = {};
    if (req.query.collegeId) {
      filters.college = req.query.collegeId;
    } else if (req.user.college) {
      filters.college = req.user.college;
    }

    if (req.query.department) {
      filters.department = { $regex: req.query.department, $options: 'i' };
    }

    const [
      total,
      active,
      onLeave,
      resigned,
      retired,
      terminated
    ] = await Promise.all([
      Teacher.countDocuments(filters),
      Teacher.countDocuments({ ...filters, employmentStatus: 'active' }),
      Teacher.countDocuments({ ...filters, employmentStatus: 'on-leave' }),
      Teacher.countDocuments({ ...filters, employmentStatus: 'resigned' }),
      Teacher.countDocuments({ ...filters, employmentStatus: 'retired' }),
      Teacher.countDocuments({ ...filters, employmentStatus: 'terminated' })
    ]);

    // Get counts by staff type
    const teachingCount = await Teacher.countDocuments({ ...filters, staffType: 'teaching' });
    const nonTeachingCount = await Teacher.countDocuments({ ...filters, staffType: 'non-teaching' });

    // Get counts by designation
    const designationCounts = await Teacher.aggregate([
      { $match: filters },
      { $group: { _id: '$designation', count: { $sum: 1 } } }
    ]);

    // Get counts by department
    const departmentCounts = await Teacher.aggregate([
      { $match: filters },
      { $group: { _id: '$department', count: { $sum: 1 } } }
    ]);

    // Get counts by staff type and designation
    const staffTypeDesignationCounts = await Teacher.aggregate([
      { $match: filters },
      { $group: { 
        _id: { staffType: '$staffType', designation: '$designation' }, 
        count: { $sum: 1 } 
      } }
    ]);

    res.json({
      success: true,
      data: {
        total,
        active,
        onLeave,
        resigned,
        retired,
        terminated,
        isActive: await Teacher.countDocuments({ ...filters, isActive: true }),
        isInactive: await Teacher.countDocuments({ ...filters, isActive: false }),
        byStaffType: {
          teaching: teachingCount,
          nonTeaching: nonTeachingCount
        },
        byDesignation: designationCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byDepartment: departmentCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byStaffTypeAndDesignation: staffTypeDesignationCounts.reduce((acc, item) => {
          const key = `${item._id.staffType}_${item._id.designation}`;
          acc[key] = item.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    next(error);
  }
};

// TEACHER ATTENDANCE CRUD
const getTeacherAttendances = async (req, res, next) => {
  try {
    const filters = {};
    const query = req.query;

    if (req.user.college) {
      filters.college = req.user.college;
    }
    if (query?.teacherId) {
      filters.teacher = query.teacherId;
    }
    if (query.status) {
      filters.status = query.status;
    }
    if (query.startDate || query.endDate) {
      filters.date = {};
      if (query.startDate) {
        filters.date.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filters.date.$lte = new Date(query.endDate);
      }
    } else if (query.month && query.year) {
      const startDate = new Date(query.year, query.month - 1, 1);
      const endDate = new Date(query.year, query.month, 0);
      filters.date = { $gte: startDate, $lte: endDate };
    }

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy || 'date';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const attendances = await TeacherAttendance.find(filters)
      .populate('teacher', 'name employeeId department designation')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await TeacherAttendance.countDocuments(filters);

    res.json({
      success: true,
      data: attendances,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getTeacherAttendanceById = async (req, res, next) => {
  try {
    const attendance = await TeacherAttendance.findById(req.params.id)
      .populate('teacher', 'name employeeId department designation')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    // Optionally include college criteria if requested
    const includeCriteria = req.query.includeCriteria === 'true';
    let responseData = { attendance };

    if (includeCriteria) {
      const criteria = await attendance.getCollegeCriteria();
      responseData.criteria = criteria;
    }

    res.json({ success: true, data: includeCriteria ? responseData : attendance });
  } catch (error) {
    next(error);
  }
};

const createTeacherAttendance = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const teacher = await Teacher.findById(req.body.teacher);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const collegeId = req.body.college || req.user.college || teacher.college;
    
    // Apply college criteria to attendance data
    let data = {
      ...req.body,
      college: collegeId,
      createdBy: req.user._id
    };

    // Apply college criteria if available
    try {
      data = await TeacherAttendance.applyCollegeCriteria(data, collegeId);
    } catch (error) {
      // Continue even if criteria application fails
      console.warn('Failed to apply college criteria:', error.message);
    }

    // Validate against college criteria before creating
    const attendance = new TeacherAttendance(data);
    const validation = await attendance.validateAgainstCriteria();
    
    if (!validation.valid && validation.errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Attendance validation failed',
        errors: validation.errors
      });
    }

    await attendance.save();
    
    const populated = await TeacherAttendance.findById(attendance._id)
      .populate('teacher', 'name employeeId department designation')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Attendance record already exists for this teacher on this date'
      });
    } else {
      next(error);
    }
  }
};

const createMassTeacherAttendance = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const { teachers, dates, commonData, perTeacherData, perDateData } = req.body;

    // Validate required fields
    if (!teachers || !Array.isArray(teachers) || teachers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Teachers array is required and must not be empty'
      });
    }

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dates array is required and must not be empty'
      });
    }

    // Validate all teachers exist
    const teacherDocs = await Teacher.find({ _id: { $in: teachers } });
    if (teacherDocs.length !== teachers.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more teachers not found'
      });
    }

    // Get college ID from first teacher or user
    const collegeId = commonData?.college || req.user.college || teacherDocs[0].college;

    // Validate dates are valid
    const validDates = dates.map(dateStr => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${dateStr}`);
      }
      // Normalize date to start of day
      date.setHours(0, 0, 0, 0);
      return date;
    });

    // Prepare results tracking
    const results = {
      created: [],
      skipped: [],
      failed: [],
      summary: {
        total: teachers.length * validDates.length,
        created: 0,
        skipped: 0,
        failed: 0
      }
    };

    // Process each teacher-date combination
    for (const teacherId of teachers) {
      const teacher = teacherDocs.find(t => t._id.toString() === teacherId.toString());
      if (!teacher) continue;

      const teacherSpecificData = perTeacherData?.find(ptd => ptd.teacherId === teacherId.toString())?.data || {};

      for (const date of validDates) {
        const dateStr = date.toISOString().split('T')[0];
        const dateSpecificData = perDateData?.find(pdd => {
          const pddDate = new Date(pdd.date);
          pddDate.setHours(0, 0, 0, 0);
          return pddDate.getTime() === date.getTime();
        })?.data || {};

        try {
          // Check if attendance already exists
          const existing = await TeacherAttendance.findOne({
            teacher: teacherId,
            date: date
          });

          if (existing) {
            results.skipped.push({
              teacherId: teacherId.toString(),
              teacherName: teacher.name,
              employeeId: teacher.employeeId,
              date: dateStr,
              reason: 'Attendance record already exists'
            });
            results.summary.skipped++;
            continue;
          }

          // Merge all data sources: commonData -> teacherSpecificData -> dateSpecificData
          const attendanceData = {
            teacher: teacherId,
            date: date,
            college: collegeId || teacher.college,
            createdBy: req.user._id,
            ...commonData,
            ...teacherSpecificData,
            ...dateSpecificData
          };

          // Apply college criteria if available
          try {
            const finalData = await TeacherAttendance.applyCollegeCriteria(
              attendanceData,
              attendanceData.college
            );
            Object.assign(attendanceData, finalData);
          } catch (error) {
            console.warn(`Failed to apply college criteria for teacher ${teacherId} on ${dateStr}:`, error.message);
          }

          // Create attendance record
          const attendance = new TeacherAttendance(attendanceData);
          
          // Validate against college criteria (non-blocking for bulk operations)
          const validation = await attendance.validateAgainstCriteria();
          if (!validation.valid && validation.errors.length > 0) {
            // Log validation errors but don't block creation
            console.warn(`Validation warnings for teacher ${teacherId} on ${dateStr}:`, validation.errors);
          }

          await attendance.save();

          results.created.push({
            teacherId: teacherId.toString(),
            teacherName: teacher.name,
            employeeId: teacher.employeeId,
            date: dateStr,
            attendanceId: attendance._id.toString()
          });
          results.summary.created++;

        } catch (error) {
          // Handle duplicate key error (shouldn't happen due to check, but just in case)
          if (error.code === 11000) {
            results.skipped.push({
              teacherId: teacherId.toString(),
              teacherName: teacher.name,
              employeeId: teacher.employeeId,
              date: dateStr,
              reason: 'Attendance record already exists (duplicate key)'
            });
            results.summary.skipped++;
          } else {
            results.failed.push({
              teacherId: teacherId.toString(),
              teacherName: teacher.name,
              employeeId: teacher.employeeId,
              date: dateStr,
              error: error.message
            });
            results.summary.failed++;
            console.error(`Failed to create attendance for teacher ${teacherId} on ${dateStr}:`, error);
          }
        }
      }
    }

    // Return results
    res.status(201).json({
      success: true,
      message: `Mass attendance creation completed. Created: ${results.summary.created}, Skipped: ${results.summary.skipped}, Failed: ${results.summary.failed}`,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

const updateTeacherAttendance = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const attendance = await TeacherAttendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    const updatableFields = [
      'date',
      'status',
      'checkIn',
      'checkOut',
      'expectedCheckIn',
      'expectedCheckOut',
      'workingHours',
      'overtimeHours',
      'breakStart',
      'breakEnd',
      'checkInLocation',
      'checkOutLocation',
      'attendanceMethod',
      'checkInIP',
      'checkOutIP',
      'checkInDevice',
      'checkOutDevice',
      'checkInPhoto',
      'checkOutPhoto',
      'leaveType',
      'leaveStartDate',
      'leaveEndDate',
      'leaveDays',
      'remarks'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        attendance[field] = req.body[field];
      }
    });

    // If date is being updated, reapply college criteria for expected times
    if (req.body.date && attendance.college) {
      try {
        const updatedData = await TeacherAttendance.applyCollegeCriteria(
          { date: req.body.date },
          attendance.college
        );
        if (updatedData.expectedCheckIn) {
          attendance.expectedCheckIn = updatedData.expectedCheckIn;
        }
        if (updatedData.expectedCheckOut) {
          attendance.expectedCheckOut = updatedData.expectedCheckOut;
        }
      } catch (error) {
        console.warn('Failed to reapply college criteria:', error.message);
      }
    }

    // Validate against college criteria before saving
    const validation = await attendance.validateAgainstCriteria();
    
    if (!validation.valid && validation.errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Attendance validation failed',
        errors: validation.errors
      });
    }

    attendance.updatedBy = req.user._id;
    await attendance.save();

    const updated = await TeacherAttendance.findById(attendance._id)
      .populate('teacher', 'name employeeId department designation')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Attendance record already exists for this teacher on this date'
      });
    } else {
      next(error);
    }
  }
};

const deleteTeacherAttendance = async (req, res, next) => {
  try {
    const attendance = await TeacherAttendance.findByIdAndDelete(req.params.id);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getTeacherAttendanceSummary = async (req, res, next) => {
  try {
    const { teacherId, month, year } = req.query;

    if (!teacherId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID, month, and year are required'
      });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const attendances = await TeacherAttendance.find({
      teacher: teacherId,
      date: { $gte: startDate, $lte: endDate }
    })
      .populate('college', 'name code');

    // Get college criteria if available
    let collegeCriteria = null;
    if (attendances.length > 0 && attendances[0].college) {
      try {
        const CollegeAttendanceCriteria = require('../models/collegeAttendanceCriteria.model');
        collegeCriteria = await CollegeAttendanceCriteria.findOne({ 
          college: attendances[0].college._id || attendances[0].college, 
          isActive: true 
        });
      } catch (error) {
        // Continue without criteria
      }
    }

    const presentDays = attendances.filter(a => a.status === 'present').length;
    const absentDays = attendances.filter(a => a.status === 'absent').length;
    const leaveDays = attendances.filter(a => a.status === 'leave').length;
    const halfDays = attendances.filter(a => a.status === 'half-day').length;
    const lateDays = attendances.filter(a => a.status === 'late').length;
    const earlyLeaveDays = attendances.filter(a => a.status === 'early-leave').length;
    const wfhDays = attendances.filter(a => a.status === 'work-from-home').length;
    
    const totalWorkingHours = attendances.reduce((sum, a) => sum + (a.workingHours || 0), 0);
    const totalOvertimeHours = attendances.reduce((sum, a) => sum + (a.overtimeHours || 0), 0);
    
    // Calculate attendance percentage based on present + half-day + wfh
    const effectivePresentDays = presentDays + halfDays + wfhDays;
    const attendancePercentage = attendances.length > 0
      ? ((effectivePresentDays / attendances.length) * 100).toFixed(2)
      : 0;

    const summary = {
      totalDays: attendances.length,
      presentDays,
      absentDays,
      leaveDays,
      halfDays,
      lateDays,
      earlyLeaveDays,
      wfhDays,
      totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
      totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      attendancePercentage: parseFloat(attendancePercentage),
      averageWorkingHours: attendances.length > 0 
        ? Math.round((totalWorkingHours / attendances.length) * 100) / 100 
        : 0,
      // Include criteria info if available
      criteria: collegeCriteria ? {
        expectedWorkingHours: collegeCriteria.timeSettings?.workingHoursPerDay || 8,
        standardHours: collegeCriteria.overtimeSettings?.standardHours || 8
      } : null
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

// Validate attendance against college criteria
const validateTeacherAttendance = async (req, res, next) => {
  try {
    const attendance = await TeacherAttendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    const validation = await attendance.validateAgainstCriteria();

    res.json({
      success: true,
      data: {
        attendanceId: attendance._id,
        valid: validation.valid,
        errors: validation.errors,
        criteria: validation.criteria
      }
    });
  } catch (error) {
    next(error);
  }
};

// Check in for attendance
const checkInAttendance = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const attendanceId = req.params.id;
    const { location, ip, device, photo, method } = req.body;

    let attendance = await TeacherAttendance.findById(attendanceId);
    
    if (!attendance) {
      // Create new attendance record if it doesn't exist
      const { teacher, date, college } = req.body;
      
      if (!teacher || !date) {
        return res.status(400).json({
          success: false,
          message: 'Teacher ID and date are required for new attendance record'
        });
      }

      const teacherDoc = await Teacher.findById(teacher);
      if (!teacherDoc) {
        return res.status(404).json({ success: false, message: 'Teacher not found' });
      }

      const collegeId = college || req.user.college || teacherDoc.college;
      
      // Apply college criteria
      let data = {
        teacher,
        date: new Date(date),
        college: collegeId,
        createdBy: req.user._id
      };

      try {
        data = await TeacherAttendance.applyCollegeCriteria(data, collegeId);
      } catch (error) {
        console.warn('Failed to apply college criteria:', error.message);
      }

      attendance = await TeacherAttendance.create(data);
    }

    // Perform check-in with validation
    try {
      await attendance.performCheckIn({
        checkIn: req.body.checkIn || new Date(),
        location,
        ip: ip || req.ip,
        device,
        photo,
        method
      });
    } catch (error) {
      if (error.message.includes('outside the allowed area')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    const populated = await TeacherAttendance.findById(attendance._id)
      .populate('teacher', 'name employeeId department designation')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Check out for attendance
const checkOutAttendance = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const attendance = await TeacherAttendance.findById(req.params.id);
    
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    if (!attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: 'Check-in must be performed before check-out'
      });
    }

    const { location, ip, device, photo } = req.body;

    // Perform check-out with validation
    try {
      await attendance.performCheckOut({
        checkOut: req.body.checkOut || new Date(),
        location,
        ip: ip || req.ip,
        device,
        photo
      });
    } catch (error) {
      if (error.message.includes('outside the allowed area')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    const populated = await TeacherAttendance.findById(attendance._id)
      .populate('teacher', 'name employeeId department designation')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Approve attendance
const approveTeacherAttendance = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const attendance = await TeacherAttendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    const { remarks } = req.body;
    await attendance.approve(req.user._id, remarks);

    const populated = await TeacherAttendance.findById(attendance._id)
      .populate('teacher', 'name employeeId department designation')
      .populate('college', 'name code')
      .populate('approvedBy', 'name email')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Reject attendance
const rejectTeacherAttendance = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const attendance = await TeacherAttendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    await attendance.reject(req.user._id, reason);

    const populated = await TeacherAttendance.findById(attendance._id)
      .populate('teacher', 'name employeeId department designation')
      .populate('college', 'name code')
      .populate('approvedBy', 'name email')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Regularize attendance
const regularizeTeacherAttendance = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const attendance = await TeacherAttendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Regularization reason is required'
      });
    }

    await attendance.markAsRegularized(req.user._id, reason);

    const populated = await TeacherAttendance.findById(attendance._id)
      .populate('teacher', 'name employeeId department designation')
      .populate('college', 'name code')
      .populate('regularizationApprovedBy', 'name email')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// PAYROLL CRUD
const getPayrolls = async (req, res, next) => {
  try {
    const filters = {};
    const query = req.query;

    if (req.user.college) {
      filters.college = req.user.college;
    }
    if (query.teacherId) {
      filters.teacher = query.teacherId;
    }
    if (query.status) {
      filters.status = query.status;
    }
    if (query.month) {
      filters.month = parseInt(query.month);
    }
    if (query.year) {
      filters.year = parseInt(query.year);
    }

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    // Additional filters for advanced features
    if (query.isReversed !== undefined) {
      filters.isReversed = query.isReversed === 'true';
    }
    if (query.isOnHold !== undefined) {
      filters.isOnHold = query.isOnHold === 'true';
    }
    if (query.department) {
      filters.department = query.department;
    }
    if (query.costCenter) {
      filters.costCenter = query.costCenter;
    }

    const payrolls = await Payroll.find(filters)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      // .populate('department', 'name')
      .populate('costCenter', 'name code')
      .populate('expense', 'title amount')
      .populate('approvedBy', 'name email')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Payroll.countDocuments(filters);

    res.json({
      success: true,
      data: payrolls,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getPayrollById = async (req, res, next) => {
  try {
    const payroll = await Payroll.findById(req.params.id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      // .populate('department', 'name')
      .populate('costCenter', 'name code')
      .populate('salaryStructure', 'name version')
      .populate('expense', 'title amount date')
      .populate('ledger', 'description amount')
      // .populate('loanDeductions.loanId', 'loanNumber amount')
      // .populate('advanceDeductions.advanceId', 'advanceNumber amount')
      .populate('paymentSplits.account', 'name accountType')
      .populate('approvalWorkflow.approver', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .populate('reversedBy', 'name email')
      .populate('originalPayroll', 'payrollNumber')
      .populate('reversalPayroll', 'payrollNumber')
      .populate('paySlipGeneratedBy', 'name email')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    res.json({ success: true, data: payroll });
  } catch (error) {
    next(error);
  }
};

const generatePayroll = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const {
      teacherId,
      month,
      year,
      items,
      overtimeHours,
      overtimeRate,
      taxDetails,
      loanDeductions,
      advanceDeductions,
      reimbursements,
      leaveEncashment,
      bonus,
      incentives,
      arrears,
      taxExemptions,
      department,
      costCenter,
      salaryStructure,
      notes,
      internalNotes,
      tags,
      approvalWorkflow
    } = req.body;

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Check if payroll already exists
    const existingPayroll = await Payroll.findOne({
      teacher: teacherId,
      month: parseInt(month),
      year: parseInt(year)
    });

    if (existingPayroll) {
      return res.status(409).json({
        success: false,
        message: 'Payroll already exists for this teacher for the specified month and year'
      });
    }

    // Get attendance summary
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const lastDay = new Date(year, month, 0).getDate();

    const attendances = await TeacherAttendance.find({
      teacher: teacherId,
      date: { $gte: startDate, $lte: endDate }
    });

    const presentDays = attendances.filter(a => a.status === 'present').length;
    const absentDays = attendances.filter(a => a.status === 'absent').length;
    const leaveDays = attendances.filter(a => a.status === 'leave').length;
    const halfDays = attendances.filter(a => a.status === 'half-day').length;
    const totalWorkingHours = attendances.reduce((sum, a) => sum + (a.workingHours || 0), 0);

    // Calculate base salary (proportional to attendance)
    const baseSalary = teacher.salary || 0;
    const dailySalary = baseSalary / lastDay;
    const calculatedSalary = (presentDays * dailySalary) + (halfDays * dailySalary * 0.5);

    // Calculate overtime amount
    const overtimeAmount = (overtimeHours || 0) * (overtimeRate || 0);

    // Calculate leave encashment amount if provided
    let leaveEncashmentAmount = 0;
    if (leaveEncashment && leaveEncashment.encashedDays && leaveEncashment.ratePerDay) {
      leaveEncashmentAmount = leaveEncashment.encashedDays * leaveEncashment.ratePerDay;
    }

    // Generate payroll number
    const collegeId = req.body.college || req.user.college || teacher.college;
    const count = await Payroll.countDocuments({ college: collegeId });
    const payrollNumber = `PAY${year}${String(month).padStart(2, '0')}${String(count + 1).padStart(4, '0')}`;

    // Calculate YTD values
    const ytdData = await Payroll.calculateYTD(teacherId, parseInt(year), parseInt(month));

    const payrollData = {
      payrollNumber,
      teacher: teacherId,
      month: parseInt(month),
      year: parseInt(year),
      periodStart: startDate,
      periodEnd: endDate,
      totalDays: lastDay,
      presentDays,
      absentDays,
      leaveDays,
      halfDays,
      workingHours: totalWorkingHours,
      overtimeHours: overtimeHours || 0,
      overtimeRate: overtimeRate || 0,
      overtimeAmount,
      baseSalary: calculatedSalary,
      items: items || [],
      taxDetails: taxDetails || {},
      loanDeductions: loanDeductions || [],
      advanceDeductions: advanceDeductions || [],
      reimbursements: reimbursements || [],
      leaveEncashment: leaveEncashment ? {
        ...leaveEncashment,
        amount: leaveEncashmentAmount
      } : undefined,
      bonus: bonus || 0,
      incentives: incentives || 0,
      arrears: arrears || undefined,
      taxExemptions: taxExemptions || {},
      ytdGrossSalary: ytdData.grossSalary + calculatedSalary,
      ytdNetSalary: ytdData.netSalary + calculatedSalary,
      department: department || teacher.department,
      costCenter: costCenter || undefined,
      salaryStructure: salaryStructure || undefined,
      notes: notes || '',
      internalNotes: internalNotes || '',
      tags: tags || [],
      approvalWorkflow: approvalWorkflow || [],
      college: collegeId,
      createdBy: req.user._id
    };

    const payroll = await Payroll.create(payrollData);
    const populated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('college', 'name code')
      // .populate('department', 'name')
      .populate('costCenter', 'name code')
      .populate('salaryStructure', 'name version')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Payroll already exists for this teacher for the specified month and year'
      });
    } else {
      next(error);
    }
  }
};

const updatePayroll = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    // Check if payroll can be edited
    if (!payroll.canEdit()) {
      return res.status(400).json({
        success: false,
        message: 'Payroll cannot be edited in its current state'
      });
    }

    const updatableFields = [
      'status',
      'items',
      'baseSalary',
      'overtimeHours',
      'overtimeRate',
      'taxDetails',
      'loanDeductions',
      'advanceDeductions',
      'reimbursements',
      'leaveEncashment',
      'bonus',
      'incentives',
      'arrears',
      'taxExemptions',
      'paymentDate',
      'paymentMethod',
      'account',
      'transactionReference',
      'department',
      'costCenter',
      'salaryStructure',
      'notes',
      'internalNotes',
      'tags'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        payroll[field] = req.body[field];
      }
    });

    // Recalculate overtime amount if overtime fields are updated
    if (req.body.overtimeHours !== undefined || req.body.overtimeRate !== undefined) {
      payroll.overtimeAmount = (payroll.overtimeHours || 0) * (payroll.overtimeRate || 0);
    }

    // Recalculate leave encashment amount if provided
    if (req.body.leaveEncashment) {
      if (req.body.leaveEncashment.encashedDays && req.body.leaveEncashment.ratePerDay) {
        payroll.leaveEncashment.amount = req.body.leaveEncashment.encashedDays * req.body.leaveEncashment.ratePerDay;
      }
    }

    payroll.updatedBy = req.user._id;
    await payroll.save();

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      // .populate('department', 'name')
      .populate('costCenter', 'name code')
      .populate('salaryStructure', 'name version')
      .populate('expense', 'title amount')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .populate('approvalWorkflow.approver', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const deletePayroll = async (req, res, next) => {
  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    // If payroll is paid, revert finance entries
    if (payroll.status === 'paid' && payroll.expense) {
      const expense = await Expense.findById(payroll.expense);
      if (expense) {
        await Expense.findByIdAndDelete(payroll.expense);
      }

      if (payroll.ledger) {
        await Ledger.findByIdAndDelete(payroll.ledger);
      }

      // Update account balance if account exists
      if (payroll.account) {
        const account = await Account.findById(payroll.account);
        if (account) {
          account.balance += payroll.netSalary;
          account.updatedBy = req.user._id;
          await account.save();
        }
      }
    }

    await Payroll.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};


// Approval workflow controllers
const approvePayroll = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    const { comments, level } = req.body;
    const approvalLevel = level || payroll.currentApprovalLevel + 1;

    // Update or add approval in workflow
    const workflowIndex = payroll.approvalWorkflow.findIndex(
      w => w.level === approvalLevel && w.approver.toString() === req.user._id.toString()
    );

    if (workflowIndex >= 0) {
      payroll.approvalWorkflow[workflowIndex].status = 'approved';
      payroll.approvalWorkflow[workflowIndex].comments = comments || '';
      payroll.approvalWorkflow[workflowIndex].approvedAt = new Date();
    } else {
      payroll.approvalWorkflow.push({
        level: approvalLevel,
        approver: req.user._id,
        status: 'approved',
        comments: comments || '',
        approvedAt: new Date()
      });
    }

    payroll.currentApprovalLevel = approvalLevel;
    payroll.updatedBy = req.user._id;

    // Check if all approvals are done
    const allApproved = payroll.approvalWorkflow.every(w => w.status === 'approved');
    if (allApproved) {
      payroll.status = 'approved';
      payroll.approvedBy = req.user._id;
      payroll.approvedAt = new Date();
    }

    await payroll.save();

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('approvalWorkflow.approver', 'name email')
      .populate('approvedBy', 'name email')
      .populate('college', 'name code');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const rejectPayroll = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    const { comments, level } = req.body;
    const approvalLevel = level || payroll.currentApprovalLevel + 1;

    // Update or add rejection in workflow
    const workflowIndex = payroll.approvalWorkflow.findIndex(
      w => w.level === approvalLevel && w.approver.toString() === req.user._id.toString()
    );

    if (workflowIndex >= 0) {
      payroll.approvalWorkflow[workflowIndex].status = 'rejected';
      payroll.approvalWorkflow[workflowIndex].comments = comments || '';
      payroll.approvalWorkflow[workflowIndex].rejectedAt = new Date();
    } else {
      payroll.approvalWorkflow.push({
        level: approvalLevel,
        approver: req.user._id,
        status: 'rejected',
        comments: comments || '',
        rejectedAt: new Date()
      });
    }

    payroll.status = 'cancelled';
    payroll.rejectedBy = req.user._id;
    payroll.rejectedAt = new Date();
    payroll.rejectionReason = comments || 'Rejected by approver';
    payroll.updatedBy = req.user._id;

    await payroll.save();

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('approvalWorkflow.approver', 'name email')
      .populate('rejectedBy', 'name email')
      .populate('college', 'name code');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Payroll reversal
const reversePayroll = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    if (!payroll.canReverse()) {
      return res.status(400).json({
        success: false,
        message: 'Payroll cannot be reversed in its current state'
      });
    }

    const { reason } = req.body;

    // Create reversal payroll
    const reversalData = {
      ...payroll.toObject(),
      _id: undefined,
      payrollNumber: `${payroll.payrollNumber}-REV`,
      status: 'reversed',
      isReversed: true,
      reversedAt: new Date(),
      reversedBy: req.user._id,
      reversalReason: reason || 'Payroll reversal',
      originalPayroll: payroll._id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Negate all amounts
    reversalData.baseSalary = -reversalData.baseSalary;
    reversalData.grossSalary = -reversalData.grossSalary;
    reversalData.netSalary = -reversalData.netSalary;
    reversalData.totalAllowances = -reversalData.totalAllowances;
    reversalData.totalDeductions = -reversalData.totalDeductions;
    if (reversalData.items) {
      reversalData.items = reversalData.items.map(item => ({
        ...item,
        amount: -item.amount
      }));
    }

    const reversalPayroll = await Payroll.create(reversalData);

    // Update original payroll
    payroll.isReversed = true;
    payroll.reversedAt = new Date();
    payroll.reversedBy = req.user._id;
    payroll.reversalReason = reason || 'Payroll reversal';
    payroll.reversalPayroll = reversalPayroll._id;
    payroll.status = 'reversed';
    payroll.updatedBy = req.user._id;
    await payroll.save();

    // Revert finance entries if paid
    if (payroll.expense) {
      await Expense.findByIdAndDelete(payroll.expense);
    }
    if (payroll.ledger) {
      await Ledger.findByIdAndDelete(payroll.ledger);
    }
    if (payroll.account) {
      const account = await Account.findById(payroll.account);
      if (account) {
        account.balance += payroll.netSalary;
        account.updatedBy = req.user._id;
        await account.save();
      }
    }

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('reversedBy', 'name email')
      .populate('reversalPayroll', 'payrollNumber')
      .populate('college', 'name code');

    res.json({ success: true, data: updated, reversalPayroll });
  } catch (error) {
    next(error);
  }
};

// Hold/Unhold salary
const holdPayroll = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    const { reason, holdFrom, holdTo } = req.body;

    payroll.isOnHold = true;
    payroll.holdReason = reason || '';
    payroll.holdFrom = holdFrom ? new Date(holdFrom) : new Date();
    payroll.holdTo = holdTo ? new Date(holdTo) : undefined;
    payroll.status = 'on-hold';
    payroll.updatedBy = req.user._id;

    await payroll.save();

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('college', 'name code');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const unholdPayroll = async (req, res, next) => {
  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    if (!payroll.isOnHold) {
      return res.status(400).json({
        success: false,
        message: 'Payroll is not on hold'
      });
    }

    payroll.isOnHold = false;
    payroll.holdReason = '';
    payroll.holdFrom = undefined;
    payroll.holdTo = undefined;
    
    // Restore previous status if it was pending/approved
    if (payroll.status === 'on-hold') {
      payroll.status = payroll.approvedBy ? 'approved' : 'pending';
    }
    
    payroll.updatedBy = req.user._id;
    await payroll.save();

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('college', 'name code');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Payment splits
const addPaymentSplit = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    const { amount, paymentDate, paymentMethod, account, transactionReference } = req.body;

    // Check if total splits exceed net salary
    const totalSplits = (payroll.paymentSplits || []).reduce((sum, split) => sum + split.amount, 0);
    if (totalSplits + amount > payroll.netSalary) {
      return res.status(400).json({
        success: false,
        message: 'Total payment splits cannot exceed net salary'
      });
    }

    payroll.paymentSplits = payroll.paymentSplits || [];
    payroll.paymentSplits.push({
      amount,
      paymentDate: new Date(paymentDate),
      paymentMethod: paymentMethod || 'bank-transfer',
      account,
      transactionReference,
      status: 'pending'
    });

    payroll.updatedBy = req.user._id;
    await payroll.save();

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('paymentSplits.account', 'name accountType')
      .populate('college', 'name code');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const updatePaymentSplit = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    const { splitId } = req.params;
    const { amount, paymentDate, paymentMethod, account, transactionReference, status } = req.body;

    const splitIndex = payroll.paymentSplits.findIndex(
      s => s._id.toString() === splitId
    );

    if (splitIndex === -1) {
      return res.status(404).json({ success: false, message: 'Payment split not found' });
    }

    if (amount !== undefined) payroll.paymentSplits[splitIndex].amount = amount;
    if (paymentDate !== undefined) payroll.paymentSplits[splitIndex].paymentDate = new Date(paymentDate);
    if (paymentMethod !== undefined) payroll.paymentSplits[splitIndex].paymentMethod = paymentMethod;
    if (account !== undefined) payroll.paymentSplits[splitIndex].account = account;
    if (transactionReference !== undefined) payroll.paymentSplits[splitIndex].transactionReference = transactionReference;
    if (status !== undefined) {
      payroll.paymentSplits[splitIndex].status = status;
      if (status === 'paid') {
        payroll.paymentSplits[splitIndex].paidAt = new Date();
      }
    }

    // Update main payment status if all splits are paid
    const allPaid = payroll.paymentSplits.every(s => s.status === 'paid');
    if (allPaid && payroll.paymentSplits.length > 0) {
      payroll.status = 'paid';
      payroll.paymentDate = payroll.paymentSplits[payroll.paymentSplits.length - 1].paidAt;
    }

    payroll.updatedBy = req.user._id;
    await payroll.save();

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('paymentSplits.account', 'name accountType')
      .populate('college', 'name code');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// YTD calculations
const getPayrollYTD = async (req, res, next) => {
  try {
    const { teacherId, year, month } = req.query;

    if (!teacherId || !year) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID and year are required'
      });
    }

    const ytdMonth = month ? parseInt(month) : 12;
    const ytdData = await Payroll.calculateYTD(teacherId, parseInt(year), ytdMonth);

    // Get all payrolls for the period
    const payrolls = await Payroll.find({
      teacher: teacherId,
      year: parseInt(year),
      month: { $lte: ytdMonth },
      status: { $ne: 'cancelled' },
      isReversed: false
    })
      .populate('teacher', 'name employeeId')
      .sort({ month: 1 });

    res.json({
      success: true,
      data: {
        ...ytdData,
        payrolls,
        period: { year: parseInt(year), month: ytdMonth }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Pay slip generation
const generatePaySlip = async (req, res, next) => {
  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    payroll.paySlipGenerated = true;
    payroll.paySlipGeneratedAt = new Date();
    payroll.paySlipGeneratedBy = req.user._id;
    payroll.updatedBy = req.user._id;

    await payroll.save();

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary email')
      .populate('college', 'name code address')
      // .populate('department', 'name')
      .populate('paySlipGeneratedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const markPaySlipSent = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    const { sentTo } = req.body;

    payroll.paySlipSent = true;
    payroll.paySlipSentAt = new Date();
    payroll.paySlipSentTo = sentTo || '';
    payroll.updatedBy = req.user._id;

    await payroll.save();

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId email')
      .populate('college', 'name code');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Update processPayrollPayment to support payment splits
const processPayrollPaymentUpdated = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    if (!payroll.canPay()) {
      return res.status(400).json({
        success: false,
        message: 'Payroll cannot be paid in its current state'
      });
    }

    const { accountId, paymentDate, paymentMethod, transactionReference, useSplits } = req.body;

    // If using payment splits, process them
    if (useSplits && payroll.paymentSplits && payroll.paymentSplits.length > 0) {
      // Process each split
      for (const split of payroll.paymentSplits) {
        if (split.status === 'pending') {
          // Create expense for each split
          const teacher = await Teacher.findById(payroll.teacher);
          const teacherName = teacher ? teacher.name : 'Teacher';

          let salaryCategory = await FinanceCategory.findOne({
            name: 'Salary',
            type: { $in: ['expense', 'both'] },
            college: payroll.college
          });

          if (!salaryCategory) {
            salaryCategory = await FinanceCategory.create({
              name: 'Salary',
              type: 'expense',
              description: 'Teacher salary payments',
              college: payroll.college,
              createdBy: req.user._id
            });
          }

          const expense = await Expense.create({
            title: `Salary Payment - ${teacherName} - ${payroll.payrollNumber} - Split`,
            amount: split.amount,
            date: split.paymentDate,
            category: salaryCategory._id,
            vendor: teacherName,
            paymentMethod: split.paymentMethod || 'bank-transfer',
            referenceNumber: split.transactionReference || payroll.payrollNumber,
            notes: `Payroll payment split for ${payroll.month}/${payroll.year}`,
            college: payroll.college,
            createdBy: req.user._id
          });

          if (split.account) {
            const account = await Account.findById(split.account);
            if (account) {
              account.balance -= split.amount;
              account.updatedBy = req.user._id;
              await account.save();

              await Ledger.create({
                entryDate: split.paymentDate,
                entryType: 'expense',
                transactionType: 'debit',
                account: account._id,
                amount: split.amount,
                description: `Salary payment split: ${payroll.payrollNumber}`,
                reference: payroll.payrollNumber,
                referenceId: expense._id,
                referenceModel: 'Expense',
                balance: account.balance,
                category: salaryCategory._id,
                college: payroll.college,
                createdBy: req.user._id
              });
            }
          }

          split.status = 'paid';
          split.paidAt = new Date();
        }
      }

      payroll.status = 'paid';
      payroll.paymentDate = payroll.paymentSplits[payroll.paymentSplits.length - 1].paidAt;
    } else {
      // Original single payment logic
      let salaryCategory = await FinanceCategory.findOne({
        name: 'Salary',
        type: { $in: ['expense', 'both'] },
        college: payroll.college
      });

      if (!salaryCategory) {
        salaryCategory = await FinanceCategory.create({
          name: 'Salary',
          type: 'expense',
          description: 'Teacher salary payments',
          college: payroll.college,
          createdBy: req.user._id
        });
      }

      const account = accountId ? await Account.findById(accountId) : null;
      if (accountId && !account) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }

      const teacher = await Teacher.findById(payroll.teacher);
      const teacherName = teacher ? teacher.name : 'Teacher';

      const expense = await Expense.create({
        title: `Salary Payment - ${teacherName} - ${payroll.payrollNumber}`,
        amount: payroll.netSalary,
        date: paymentDate || new Date(),
        category: salaryCategory._id,
        vendor: teacherName,
        paymentMethod: paymentMethod || 'bank-transfer',
        referenceNumber: transactionReference || payroll.payrollNumber,
        notes: `Payroll payment for ${payroll.month}/${payroll.year}`,
        college: payroll.college,
        createdBy: req.user._id,
        account:accountId
      });

      if (account) {
        account.balance -= payroll.netSalary;
        account.updatedBy = req.user._id;
        await account.save();

        const ledger = await Ledger.create({
          entryDate: paymentDate || new Date(),
          entryType: 'expense',
          transactionType: 'debit',
          account: account._id,
          amount: payroll.netSalary,
          description: `Salary payment: ${payroll.payrollNumber}`,
          reference: payroll.payrollNumber,
          referenceId: expense._id,
          referenceModel: 'Expense',
          balance: account.balance,
          category: salaryCategory._id,
          college: payroll.college,
          createdBy: req.user._id
        });

        payroll.ledger = ledger._id;
      }

      payroll.status = 'paid';
      payroll.expense = expense._id;
      payroll.account = accountId || payroll.account;
      payroll.paymentDate = paymentDate || new Date();
      payroll.paymentMethod = paymentMethod || payroll.paymentMethod;
      payroll.transactionReference = transactionReference || payroll.transactionReference;
    }

    payroll.updatedBy = req.user._id;
    await payroll.save();

    const updated = await Payroll.findById(payroll._id)
      .populate('teacher', 'name employeeId department designation salary')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('expense', 'title amount date')
      .populate('ledger', 'description amount')
      .populate('paymentSplits.account', 'name accountType')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
  processPayrollPayment: processPayrollPaymentUpdated,
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
};

