const { validationResult } = require('express-validator');
const CollegeAttendanceCriteria = require('../models/collegeAttendanceCriteria.model');
const College = require('../models/college.model');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

// Get attendance criteria for a college
const getCollegeAttendanceCriteria = async (req, res, next) => {
  try {
    const collegeId = req.params.collegeId || req.user.college;

    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'College ID is required'
      });
    }

    // Check if college exists
    const college = await College.findById(collegeId);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }

    let criteria = await CollegeAttendanceCriteria.findOne({ college: collegeId })
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    // If no criteria exists, return default structure
    if (!criteria) {
      return res.json({
        success: true,
        data: null,
        message: 'No attendance criteria configured. Using default settings.'
      });
    }

    res.json({ success: true, data: criteria });
  } catch (error) {
    next(error);
  }
};

// Create or update attendance criteria for a college
const upsertCollegeAttendanceCriteria = async (req, res, next) => {
  if (handleValidation(req, res)) return;
console.log(req.body);
console.log(req.params);
console.log(req.user);
  try {
    const collegeId = req.params.collegeId || req.body.college || req.user.college;

    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'College ID is required'
      });
    }

    // Check if college exists
    const college = await College.findById(collegeId);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }

    // Check if criteria already exists
    let criteria = await CollegeAttendanceCriteria.findOne({ college: collegeId });

    if (criteria) {
      // Update existing criteria
      Object.keys(req.body).forEach((key) => {
        if (key !== 'college' && key !== '_id' && key !== 'createdAt' && key !== 'createdBy') {
          if (typeof req.body[key] === 'object' && !Array.isArray(req.body[key]) && req.body[key] !== null) {
            // Handle nested objects
            criteria[key] = { ...criteria[key], ...req.body[key] };
          } else {
            criteria[key] = req.body[key];
          }
        }
      });
      criteria.updatedBy = req.user._id;
      await criteria.save();
    } else {
      // Create new criteria
      criteria = await CollegeAttendanceCriteria.create({
        ...req.body,
        college: collegeId,
        createdBy: req.user._id
      });
    }

    const populated = await CollegeAttendanceCriteria.findById(criteria._id)
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    // Check if this was a new document by comparing timestamps
    const wasNew = criteria.createdAt && criteria.updatedAt && 
                   Math.abs(criteria.createdAt.getTime() - criteria.updatedAt.getTime()) < 1000;
    
    res.json({
      success: true,
      data: populated,
      message: wasNew ? 'Attendance criteria created successfully' : 'Attendance criteria updated successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Attendance criteria already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

// Update specific section of attendance criteria
const updateCriteriaSection = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const { collegeId } = req.params;
    const { section, data } = req.body;

    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'College ID is required'
      });
    }

    if (!section) {
      return res.status(400).json({
        success: false,
        message: 'Section name is required'
      });
    }

    const validSections = [
      'timeSettings',
      'toleranceSettings',
      'attendanceMethods',
      'locationSettings',
      'workingDays',
      'overtimeSettings',
      'statusRules',
      'leaveSettings',
      'approvalWorkflow',
      'regularizationSettings',
      'notificationSettings',
      'advancedSettings'
    ];

    if (!validSections.includes(section)) {
      return res.status(400).json({
        success: false,
        message: `Invalid section. Must be one of: ${validSections.join(', ')}`
      });
    }

    let criteria = await CollegeAttendanceCriteria.findOne({ college: collegeId });

    if (!criteria) {
      // Create new criteria with default values if it doesn't exist
      criteria = await CollegeAttendanceCriteria.create({
        college: collegeId,
        createdBy: req.user._id
      });
    }

    // Update the specific section
    criteria[section] = { ...criteria[section], ...data };
    criteria.updatedBy = req.user._id;
    await criteria.save();

    const populated = await CollegeAttendanceCriteria.findById(criteria._id)
      .populate('college', 'name code')
      .populate('updatedBy', 'name email');

    res.json({
      success: true,
      data: populated,
      message: `${section} updated successfully`
    });
  } catch (error) {
    next(error);
  }
};

// Delete attendance criteria for a college
const deleteCollegeAttendanceCriteria = async (req, res, next) => {
  try {
    const collegeId = req.params.collegeId || req.user.college;

    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'College ID is required'
      });
    }

    const criteria = await CollegeAttendanceCriteria.findOneAndDelete({ college: collegeId });

    if (!criteria) {
      return res.status(404).json({
        success: false,
        message: 'Attendance criteria not found'
      });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// Get or create default criteria for a college
const getOrCreateDefaultCriteria = async (req, res, next) => {
  try {
    const collegeId = req.params.collegeId || req.user.college;

    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'College ID is required'
      });
    }

    const criteria = await CollegeAttendanceCriteria.getOrCreateDefault(collegeId, req.user._id);

    const populated = await CollegeAttendanceCriteria.findById(criteria._id)
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    // Check if this was a new document by comparing timestamps
    const wasNew = criteria.createdAt && criteria.updatedAt && 
                   Math.abs(criteria.createdAt.getTime() - criteria.updatedAt.getTime()) < 1000;
    
    res.json({
      success: true,
      data: populated,
      message: wasNew ? 'Default criteria created' : 'Existing criteria retrieved'
    });
  } catch (error) {
    next(error);
  }
};

// Validate location against college criteria
const validateLocation = async (req, res, next) => {
  try {
    const { collegeId } = req.params;
    const { latitude, longitude, isCheckIn } = req.body;

    if (!collegeId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'College ID, latitude, and longitude are required'
      });
    }

    const criteria = await CollegeAttendanceCriteria.findOne({ college: collegeId, isActive: true });

    if (!criteria) {
      return res.status(404).json({
        success: false,
        message: 'Attendance criteria not found for this college'
      });
    }

    const isValid = criteria.isLocationValid(latitude, longitude, isCheckIn !== false);

    res.json({
      success: true,
      data: {
        isValid,
        locationSettings: criteria.locationSettings
      }
    });
  } catch (error) {
    next(error);
  }
};

// Check if date is a working day
const checkWorkingDay = async (req, res, next) => {
  try {
    const { collegeId } = req.params;
    const { date } = req.query;

    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'College ID is required'
      });
    }

    const checkDate = date ? new Date(date) : new Date();
    const criteria = await CollegeAttendanceCriteria.findOne({ college: collegeId, isActive: true });

    if (!criteria) {
      return res.status(404).json({
        success: false,
        message: 'Attendance criteria not found for this college'
      });
    }

    const isWorkingDay = criteria.isWorkingDay(checkDate);

    res.json({
      success: true,
      data: {
        date: checkDate,
        isWorkingDay,
        workingDays: criteria.workingDays
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get expected check-in/check-out times for a date
const getExpectedTimes = async (req, res, next) => {
  try {
    const { collegeId } = req.params;
    const { date } = req.query;

    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'College ID is required'
      });
    }

    const checkDate = date ? new Date(date) : new Date();
    const criteria = await CollegeAttendanceCriteria.findOne({ college: collegeId, isActive: true });

    if (!criteria) {
      return res.status(404).json({
        success: false,
        message: 'Attendance criteria not found for this college'
      });
    }

    const expectedCheckIn = criteria.getExpectedCheckInTime(checkDate);
    const expectedCheckOut = criteria.getExpectedCheckOutTime(checkDate);

    res.json({
      success: true,
      data: {
        date: checkDate,
        expectedCheckIn,
        expectedCheckOut,
        timeSettings: criteria.timeSettings
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCollegeAttendanceCriteria,
  upsertCollegeAttendanceCriteria,
  updateCriteriaSection,
  deleteCollegeAttendanceCriteria,
  getOrCreateDefaultCriteria,
  validateLocation,
  checkWorkingDay,
  getExpectedTimes
};

