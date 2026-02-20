const { validationResult } = require('express-validator');
const Student = require('../models/student.model');
const AcademicCourse = require('../models/academicCourse.model');
const College = require('../models/college.model');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

const getAllStudents = async (req, res, next) => {
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

    // Filter by course
    if (query.courseId) {
      filters.course = query.courseId;
    }

    // Filter by Level A, B, or C
    // If any level filter is provided, find matching courses first
    if (query.levelA || query.levelB || query.levelC) {
      const courseFilters = {};
      
      // Apply college filter to course search if available
      if (filters.college) {
        courseFilters.college = filters.college;
      }
      
      if (query.levelA) {
        courseFilters.levelA = query.levelA;
      }
      if (query.levelB) {
        courseFilters.levelB = query.levelB;
      }
      if (query.levelC) {
        courseFilters.levelC = query.levelC;
      }

      // Find courses matching the level criteria
      const matchingCourses = await AcademicCourse.find(courseFilters).select('_id');
      const courseIds = matchingCourses.map((course) => course._id);

      if (courseIds.length === 0) {
        // No courses match the level criteria, return empty result
        return res.json({
          success: true,
          data: [],
          pagination: {
            page: parseInt(query.page) || 1,
            limit: parseInt(query.limit) || 10,
            total: 0,
            pages: 0
          }
        });
      }

      // If courseId filter already exists, intersect with level-based courses
      if (query.courseId) {
        if (!courseIds.includes(query.courseId)) {
          // The specified course doesn't match level criteria, return empty
          return res.json({
            success: true,
            data: [],
            pagination: {
              page: parseInt(query.page) || 1,
              limit: parseInt(query.limit) || 10,
              total: 0,
              pages: 0
            }
          });
        }
        // courseId already set in filters, no need to change
      } else {
        // Filter students by courses matching level criteria
        filters.course = { $in: courseIds };
      }
    }

    // Filter by enrollment status
    if (query.enrollmentStatus) {
      filters.enrollmentStatus = query.enrollmentStatus;
    }

    // Filter by active status
    if (query.isActive !== undefined) {
      filters.isActive = query.isActive === 'true';
    }

    // Search by name, email, studentId, or phone
    if (query.search) {
      filters.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
        { studentId: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } }
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

    const students = await Student.find(filters)
      .populate('college', 'name code')
      .populate('course', 'name batch levelA levelB levelC')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Student.countDocuments(filters);

    res.json({
      success: true,
      data: students,
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

const getStudentById = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('college', 'name code address city state')
      .populate('course', 'name batch levelA levelB levelC startDate endDate')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, data: student });
  } catch (error) {
    next(error);
  }
};

const createStudent = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    // Verify course exists
    const course = await AcademicCourse.findById(req.body.course);
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: 'Course not found' });
    }

    // Check if course has available seats
    const enrolledCount = await Student.countDocuments({
      course: req.body.course,
      enrollmentStatus: 'enrolled'
    });

    if (enrolledCount >= course.seatLimit) {
      return res.status(400).json({
        success: false,
        message: 'Course has reached its seat limit'
      });
    }

    // Generate studentId if not provided
    let studentId = req.body.studentId;
    if (!studentId) {
      const collegeId = req.body.college || req.user.college;
      let collegeCode = 'GEN';
      if (collegeId) {
        const college = await College.findById(collegeId);
        if (college) {
          collegeCode = college.code;
        }
      }
      const year = new Date().getFullYear().toString().slice(-2);
      const count = await Student.countDocuments({ college: collegeId });
      studentId = `${collegeCode}${year}${String(count + 1).padStart(4, '0')}`;
    }

    const studentData = {
      ...req.body,
      studentId,
      college: req.body.college || req.user.college,
      createdBy: req.user._id
    };

    const student = await Student.create(studentData);
    const populatedStudent = await Student.findById(student._id)
      .populate('college', 'name code')
      .populate('course', 'name batch levelA levelB levelC')
      .populate('createdBy', 'name email');

    res.status(201).json({ success: true, data: populatedStudent });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(409).json({
        success: false,
        message: `${field === 'studentId' ? 'Student ID' : 'Email'} already exists`
      });
    } else {
      next(error);
    }
  }
};

const updateStudent = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: 'Student not found' });
    }

    // Update fields
    const updatableFields = [
      'name',
      'email',
      'phone',
      'alternatePhone',
      'dateOfBirth',
      'gender',
      'address',
      'rollNumber',
      'course',
      'enrollmentDate',
      'enrollmentStatus',
      'graduationDate',
      'guardianInfo',
      'academicRecords',
      'documents',
      'isActive'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'address' && typeof req.body[field] === 'object') {
          student[field] = { ...student[field], ...req.body[field] };
        } else if (field === 'guardianInfo' && typeof req.body[field] === 'object') {
          student[field] = { ...student[field], ...req.body[field] };
        } else if (field === 'academicRecords' && typeof req.body[field] === 'object') {
          student[field] = { ...student[field], ...req.body[field] };
        } else if (field === 'documents' && typeof req.body[field] === 'object') {
          student[field] = { ...student[field], ...req.body[field] };
        } else {
          student[field] = req.body[field];
        }
      }
    });

    student.updatedBy = req.user._id;

    // If course is being changed, verify new course exists and has seats
    if (req.body.course && req.body.course !== student.course.toString()) {
      const newCourse = await AcademicCourse.findById(req.body.course);
      if (!newCourse) {
        return res
          .status(404)
          .json({ success: false, message: 'New course not found' });
      }

      const enrolledCount = await Student.countDocuments({
        course: req.body.course,
        enrollmentStatus: 'enrolled'
      });

      if (enrolledCount >= newCourse.seatLimit) {
        return res.status(400).json({
          success: false,
          message: 'New course has reached its seat limit'
        });
      }
    }

    await student.save();
    const updatedStudent = await Student.findById(student._id)
      .populate('college', 'name code')
      .populate('course', 'name batch levelA levelB levelC')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updatedStudent });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(409).json({
        success: false,
        message: `${field === 'studentId' ? 'Student ID' : 'Email'} already exists`
      });
    } else {
      next(error);
    }
  }
};

const deleteStudent = async (req, res, next) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: 'Student not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getStudentsByCourse = async (req, res, next) => {
  try {
    const courseId = req.params.courseId;
    const filters = { course: courseId };

    if (req.query.enrollmentStatus) {
      filters.enrollmentStatus = req.query.enrollmentStatus;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
    }

    const students = await Student.find(filters)
      .populate('college', 'name code')
      .populate('course', 'name batch')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: students, count: students.length });
  } catch (error) {
    next(error);
  }
};

const getStudentsByCollege = async (req, res, next) => {
  try {
    const collegeId = req.params.collegeId;
    const filters = { college: collegeId };

    if (req.query.enrollmentStatus) {
      filters.enrollmentStatus = req.query.enrollmentStatus;
    }

    if (req.query.courseId) {
      filters.course = req.query.courseId;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const students = await Student.find(filters)
      .populate('college', 'name code')
      .populate('course', 'name batch levelA levelB levelC')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Student.countDocuments(filters);

    res.json({
      success: true,
      data: students,
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

const getStudentStats = async (req, res, next) => {
  try {
    const filters = {};
    if (req.query.collegeId) {
      filters.college = req.query.collegeId;
    } else if (req.user.college) {
      filters.college = req.user.college;
    }

    if (req.query.courseId) {
      filters.course = req.query.courseId;
    }

    const [
      total,
      enrolled,
      graduated,
      dropped,
      suspended,
      transferred
    ] = await Promise.all([
      Student.countDocuments(filters),
      Student.countDocuments({ ...filters, enrollmentStatus: 'enrolled' }),
      Student.countDocuments({ ...filters, enrollmentStatus: 'graduated' }),
      Student.countDocuments({ ...filters, enrollmentStatus: 'dropped' }),
      Student.countDocuments({ ...filters, enrollmentStatus: 'suspended' }),
      Student.countDocuments({ ...filters, enrollmentStatus: 'transferred' })
    ]);

    res.json({
      success: true,
      data: {
        total,
        enrolled,
        graduated,
        dropped,
        suspended,
        transferred,
        active: await Student.countDocuments({ ...filters, isActive: true }),
        inactive: await Student.countDocuments({ ...filters, isActive: false })
      }
    });
  } catch (error) {
    next(error);
  }
};

const bulkUpdateActiveStatus = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const { students } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'students array is required and must not be empty'
      });
    }

    // Extract student IDs from the request
    const studentIds = students.map((s) => s.studentId).filter(Boolean);

    if (studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one valid student ID is required'
      });
    }

    // Find all students by IDs
    const foundStudents = await Student.find({
      _id: { $in: studentIds }
    });

    if (foundStudents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No students found with the provided IDs'
      });
    }

    // Create a map for quick lookup
    const studentMap = new Map();
    foundStudents.forEach((student) => {
      studentMap.set(student._id.toString(), student);
    });

    // Process updates
    const results = {
      updated: [],
      ignored: [],
      notFound: []
    };

    for (const studentData of students) {
      const { studentId, isActive } = studentData;

      if (!studentId) {
        results.notFound.push({
          studentId: null,
          reason: 'Student ID is missing'
        });
        continue;
      }

      const student = studentMap.get(studentId);

      if (!student) {
        results.notFound.push({
          studentId,
          reason: 'Student not found'
        });
        continue;
      }

      // Check if status needs to change
      const currentStatus = student.isActive;
      const newStatus = Boolean(isActive);

      if (currentStatus === newStatus) {
        // Status is already the same, ignore
        results.ignored.push({
          studentId,
          name: student.name,
          currentStatus,
          reason: 'Status already matches the requested value'
        });
        continue;
      }

      // Update the status
      student.isActive = newStatus;
      student.updatedBy = req.user._id;
      await student.save();

      results.updated.push({
        studentId,
        name: student.name,
        previousStatus: currentStatus,
        newStatus: newStatus
      });
    }

    res.json({
      success: true,
      message: `Bulk update completed: ${results.updated.length} updated, ${results.ignored.length} ignored, ${results.notFound.length} not found`,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentsByCourse,
  getStudentsByCollege,
  getStudentStats,
  bulkUpdateActiveStatus
};

