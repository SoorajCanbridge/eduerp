const mongoose = require('mongoose');

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

const teacherAttendanceSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: attendanceStatuses,
      required: true,
      default: 'present'
    },
    checkIn: {
      type: Date
    },
    checkOut: {
      type: Date
    },
    expectedCheckIn: {
      type: Date
    },
    expectedCheckOut: {
      type: Date
    },
    workingHours: {
      type: Number,
      min: 0,
      max: 24,
      default: 0
    },
    overtimeHours: {
      type: Number,
      min: 0,
      max: 24,
      default: 0
    },
    lateArrivalMinutes: {
      type: Number,
      min: 0,
      default: 0
    },
    earlyDepartureMinutes: {
      type: Number,
      min: 0,
      default: 0
    },
    breakStart: {
      type: Date
    },
    breakEnd: {
      type: Date
    },
    breakDuration: {
      type: Number,
      min: 0,
      default: 0
    },
    checkInLocation: {
      latitude: {
        type: Number
      },
      longitude: {
        type: Number
      },
      address: {
        type: String,
        trim: true
      }
    },
    checkOutLocation: {
      latitude: {
        type: Number
      },
      longitude: {
        type: Number
      },
      address: {
        type: String,
        trim: true
      }
    },
    attendanceMethod: {
      type: String,
      enum: ['manual', 'biometric', 'mobile-app', 'web-portal', 'rfid', 'face-recognition', 'other'],
      default: 'manual'
    },
    checkInIP: {
      type: String,
      trim: true
    },
    checkOutIP: {
      type: String,
      trim: true
    },
    checkInDevice: {
      type: String,
      trim: true
    },
    checkOutDevice: {
      type: String,
      trim: true
    },
    checkInPhoto: {
      type: String,
      trim: true
    },
    checkOutPhoto: {
      type: String,
      trim: true
    },
    leaveType: {
      type: String,
      enum: ['casual', 'sick', 'earned', 'unpaid', 'maternity', 'paternity', 'compensatory', 'sabbatical', 'other'],
      trim: true
    },
    leaveStartDate: {
      type: Date
    },
    leaveEndDate: {
      type: Date
    },
    leaveDays: {
      type: Number,
      min: 0,
      default: 0
    },
    isRegularized: {
      type: Boolean,
      default: false
    },
    regularizationReason: {
      type: String,
      trim: true
    },
    regularizationRequestedAt: {
      type: Date
    },
    regularizationApprovedAt: {
      type: Date
    },
    regularizationApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    requiresApproval: {
      type: Boolean,
      default: false
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'not-required'],
      default: 'not-required'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    },
    rejectionReason: {
      type: String,
      trim: true
    },
    remarks: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// Compound unique index to prevent duplicate attendance for same teacher on same date
teacherAttendanceSchema.index({ teacher: 1, date: 1 }, { unique: true });
teacherAttendanceSchema.index({ college: 1, date: 1 });
teacherAttendanceSchema.index({ teacher: 1 });
teacherAttendanceSchema.index({ status: 1 });
teacherAttendanceSchema.index({ approvalStatus: 1 });
teacherAttendanceSchema.index({ isRegularized: 1 });
teacherAttendanceSchema.index({ attendanceMethod: 1 });
teacherAttendanceSchema.index({ date: 1, status: 1 });
teacherAttendanceSchema.index({ teacher: 1, date: -1, status: 1 });

// Pre-save hook to calculate working hours and other metrics
teacherAttendanceSchema.pre('save', async function(next) {
  try {
    // Load college attendance criteria if available
    let collegeCriteria = null;
    if (this.college) {
      try {
        const CollegeAttendanceCriteria = mongoose.model('CollegeAttendanceCriteria');
        collegeCriteria = await CollegeAttendanceCriteria.findOne({ college: this.college, isActive: true });
        
        // Set expected check-in/check-out from college criteria if not already set
        if (collegeCriteria && !this.expectedCheckIn && this.date) {
          this.expectedCheckIn = collegeCriteria.getExpectedCheckInTime(this.date);
        }
        if (collegeCriteria && !this.expectedCheckOut && this.date) {
          this.expectedCheckOut = collegeCriteria.getExpectedCheckOutTime(this.date);
        }
      } catch (error) {
        // College criteria model might not be loaded, continue without it
        console.warn('CollegeAttendanceCriteria model not found, using defaults');
      }
    }

  // Calculate late arrival minutes
  if (this.checkIn && this.expectedCheckIn) {
    const lateDiff = this.checkIn - this.expectedCheckIn;
    if (lateDiff > 0) {
      this.lateArrivalMinutes = Math.round(lateDiff / (1000 * 60));
    } else {
      this.lateArrivalMinutes = 0;
    }
  }

  // Calculate early departure minutes
  if (this.checkOut && this.expectedCheckOut) {
    const earlyDiff = this.expectedCheckOut - this.checkOut;
    if (earlyDiff > 0) {
      this.earlyDepartureMinutes = Math.round(earlyDiff / (1000 * 60));
    } else {
      this.earlyDepartureMinutes = 0;
    }
  }

  // Calculate break duration
  if (this.breakStart && this.breakEnd) {
    const breakDiff = this.breakEnd - this.breakStart;
    this.breakDuration = Math.round((breakDiff / (1000 * 60)) * 100) / 100; // Round to 2 decimal places
  }

  // Calculate working hours
  const standardHours = collegeCriteria?.timeSettings?.workingHoursPerDay || 8;
  const halfDayHours = collegeCriteria?.timeSettings?.halfDayHours || 4;
  const statusBasedHours = collegeCriteria?.statusRules?.statusBasedWorkingHours || {};

  if (this.checkIn && this.checkOut) {
    let diff = this.checkOut - this.checkIn;
    // Subtract break duration if exists
    if (this.breakDuration > 0) {
      diff -= this.breakDuration * 60 * 1000; // Convert break duration from minutes to milliseconds
    }
    this.workingHours = Math.round((diff / (1000 * 60 * 60)) * 100) / 100; // Round to 2 decimal places
    
    // Calculate overtime based on college criteria
    const overtimeThreshold = collegeCriteria?.overtimeSettings?.overtimeThreshold || standardHours;
    if (collegeCriteria?.overtimeSettings?.enabled && this.workingHours > overtimeThreshold) {
      this.overtimeHours = Math.round((this.workingHours - overtimeThreshold) * 100) / 100;
    } else {
      this.overtimeHours = 0;
    }
  } else {
    // Use status-based working hours from college criteria or defaults
    if (statusBasedHours[this.status] !== undefined) {
      this.workingHours = statusBasedHours[this.status];
    } else if (this.status === 'present') {
      this.workingHours = standardHours;
    } else if (this.status === 'half-day') {
      this.workingHours = halfDayHours;
    } else if (this.status === 'work-from-home') {
      this.workingHours = statusBasedHours['work-from-home'] || standardHours;
    } else if (['on-duty', 'training', 'meeting', 'conference'].includes(this.status)) {
      this.workingHours = statusBasedHours[this.status] || standardHours;
    } else {
      this.workingHours = 0;
    }
    this.overtimeHours = 0;
  }

  // Auto-detect status based on college criteria
  if (collegeCriteria && collegeCriteria.statusRules.autoStatusDetection) {
    // Auto-detect late status
    if (this.checkIn && this.expectedCheckIn && !this.status) {
      const lateMinutes = this.lateArrivalMinutes || 0;
      const autoMarkLateAfter = collegeCriteria.toleranceSettings.autoMarkLateAfter || 30;
      
      if (lateMinutes > autoMarkLateAfter && collegeCriteria.statusRules.allowedStatuses.includes('late')) {
        this.status = 'late';
      } else if (this.status !== 'absent' && this.status !== 'leave') {
        this.status = this.status || 'present';
      }
    }

    // Auto-detect early-leave status
    if (this.checkOut && this.expectedCheckOut && this.status === 'present') {
      const earlyMinutes = this.earlyDepartureMinutes || 0;
      const autoMarkEarlyAfter = collegeCriteria.toleranceSettings.autoMarkEarlyLeaveAfter || 30;
      
      if (earlyMinutes > autoMarkEarlyAfter && collegeCriteria.statusRules.allowedStatuses.includes('early-leave')) {
        this.status = 'early-leave';
      }
    }
  }

  // Set approval status based on college criteria
  if (collegeCriteria) {
    const requiresApproval = collegeCriteria.requiresApproval(
      this.lateArrivalMinutes,
      this.earlyDepartureMinutes,
      this.status
    );
    
    if (requiresApproval && this.approvalStatus === 'not-required') {
      this.approvalStatus = 'pending';
      this.requiresApproval = true;
    }
  } else {
    // Fallback to default logic
    if (this.status === 'late' || this.status === 'early-leave' || this.lateArrivalMinutes > 30 || this.earlyDepartureMinutes > 30) {
      if (this.approvalStatus === 'not-required') {
        this.approvalStatus = 'pending';
        this.requiresApproval = true;
      }
    }
  }
  

  } catch (error) {
    next(error);
  }
});

// Virtual for checking if attendance is complete
teacherAttendanceSchema.virtual('isComplete').get(function() {
  return !!(this.checkIn && this.checkOut);
});

// Virtual for checking if attendance is on time
teacherAttendanceSchema.virtual('isOnTime').get(function() {
  return this.lateArrivalMinutes === 0 && this.earlyDepartureMinutes === 0;
});

// Virtual for checking if attendance needs regularization
teacherAttendanceSchema.virtual('needsRegularization').get(function() {
  return this.requiresApproval && !this.isRegularized && this.approvalStatus === 'pending';
});

// Instance method to mark as regularized
teacherAttendanceSchema.methods.markAsRegularized = function(approvedBy, reason) {
  this.isRegularized = true;
  this.regularizationApprovedAt = new Date();
  this.regularizationApprovedBy = approvedBy;
  this.regularizationReason = reason;
  this.approvalStatus = 'approved';
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  return this.save();
};

// Instance method to approve attendance
teacherAttendanceSchema.methods.approve = function(approvedBy, remarks) {
  this.approvalStatus = 'approved';
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  if (remarks) {
    this.remarks = remarks;
  }
  return this.save();
};

// Instance method to reject attendance
teacherAttendanceSchema.methods.reject = function(rejectedBy, reason) {
  this.approvalStatus = 'rejected';
  this.approvedBy = rejectedBy;
  this.approvedAt = new Date();
  this.rejectionReason = reason;
  return this.save();
};

// Instance method to perform check in
teacherAttendanceSchema.methods.performCheckIn = async function(checkInData) {
  this.checkIn = checkInData.checkIn || new Date();
  if (checkInData.location) {
    this.checkInLocation = checkInData.location;
  }
  if (checkInData.ip) {
    this.checkInIP = checkInData.ip;
  }
  if (checkInData.device) {
    this.checkInDevice = checkInData.device;
  }
  if (checkInData.photo) {
    this.checkInPhoto = checkInData.photo;
  }
  if (checkInData.method) {
    this.attendanceMethod = checkInData.method;
  }

  // Validate location against college criteria if provided
  if (checkInData.location && this.college) {
    try {
      const CollegeAttendanceCriteria = mongoose.model('CollegeAttendanceCriteria');
      const criteria = await CollegeAttendanceCriteria.findOne({ college: this.college, isActive: true });
      
      if (criteria && criteria.locationSettings.enabled) {
        const isValid = criteria.isLocationValid(
          checkInData.location.latitude,
          checkInData.location.longitude,
          true
        );
        
        if (!isValid && criteria.locationSettings.strictLocationCheck) {
          throw new Error('Check-in location is outside the allowed area');
        }
      }
    } catch (error) {
      if (error.message.includes('outside the allowed area')) {
        throw error;
      }
      // Continue if criteria not found or other errors
    }
  }

  return this.save();
};

// Instance method to perform check out
teacherAttendanceSchema.methods.performCheckOut = async function(checkOutData) {
  this.checkOut = checkOutData.checkOut || new Date();
  if (checkOutData.location) {
    this.checkOutLocation = checkOutData.location;
  }
  if (checkOutData.ip) {
    this.checkOutIP = checkOutData.ip;
  }
  if (checkOutData.device) {
    this.checkOutDevice = checkOutData.device;
  }
  if (checkOutData.photo) {
    this.checkOutPhoto = checkOutData.photo;
  }

  // Validate location against college criteria if provided
  if (checkOutData.location && this.college) {
    try {
      const CollegeAttendanceCriteria = mongoose.model('CollegeAttendanceCriteria');
      const criteria = await CollegeAttendanceCriteria.findOne({ college: this.college, isActive: true });
      
      if (criteria && criteria.locationSettings.enabled) {
        const isValid = criteria.isLocationValid(
          checkOutData.location.latitude,
          checkOutData.location.longitude,
          false
        );
        
        if (!isValid && criteria.locationSettings.strictLocationCheck) {
          throw new Error('Check-out location is outside the allowed area');
        }
      }
    } catch (error) {
      if (error.message.includes('outside the allowed area')) {
        throw error;
      }
      // Continue if criteria not found or other errors
    }
  }

  return this.save();
};

// Static method to get attendance statistics
teacherAttendanceSchema.statics.getStatistics = async function(filters = {}) {
  const stats = await this.aggregate([
    { $match: filters },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalWorkingHours: { $sum: '$workingHours' },
        totalOvertimeHours: { $sum: '$overtimeHours' },
        avgWorkingHours: { $avg: '$workingHours' }
      }
    }
  ]);

  const total = await this.countDocuments(filters);
  const presentCount = await this.countDocuments({ ...filters, status: 'present' });
  const absentCount = await this.countDocuments({ ...filters, status: 'absent' });
  const lateCount = await this.countDocuments({ ...filters, status: 'late' });
  const leaveCount = await this.countDocuments({ ...filters, status: 'leave' });

  return {
    total,
    byStatus: stats,
    presentCount,
    absentCount,
    lateCount,
    leaveCount,
    attendanceRate: total > 0 ? ((presentCount / total) * 100).toFixed(2) : 0
  };
};

// Instance method to validate attendance against college criteria
teacherAttendanceSchema.methods.validateAgainstCriteria = async function() {
  const CollegeAttendanceCriteria = mongoose.model('CollegeAttendanceCriteria');
  const criteria = await CollegeAttendanceCriteria.findOne({ college: this.college, isActive: true });
  
  if (!criteria) {
    return { valid: true, errors: [] };
  }

  const errors = [];

  // Validate attendance method
  if (this.attendanceMethod && !criteria.isMethodAllowed(this.attendanceMethod)) {
    errors.push(`Attendance method '${this.attendanceMethod}' is not allowed for this college`);
  }

  // Validate location if required
  if (criteria.locationSettings.enabled && this.checkInLocation) {
    const isCheckInValid = criteria.isLocationValid(
      this.checkInLocation.latitude,
      this.checkInLocation.longitude,
      true
    );
    if (!isCheckInValid) {
      errors.push('Check-in location is outside the allowed area');
    }
  }

  if (criteria.locationSettings.enabled && this.checkOutLocation) {
    const isCheckOutValid = criteria.isLocationValid(
      this.checkOutLocation.latitude,
      this.checkOutLocation.longitude,
      false
    );
    if (!isCheckOutValid) {
      errors.push('Check-out location is outside the allowed area');
    }
  }

  // Validate photo requirement
  if (criteria.attendanceMethods.requirePhotoVerification) {
    if (!this.checkInPhoto) {
      errors.push('Photo verification is required for check-in');
    }
  }

  // Validate working day
  if (this.date) {
    const date = this.date instanceof Date ? this.date : new Date(this.date);
    const isWorkingDay = criteria.isWorkingDay(date);
    
    if (!isWorkingDay) {
      if (!criteria.workingDays.allowWeekendAttendance && !criteria.workingDays.allowHolidayAttendance) {
        errors.push('Attendance is not allowed on this day');
      }
    }
  }

  // Validate status
  if (this.status && criteria.statusRules.allowedStatuses.length > 0) {
    if (!criteria.statusRules.allowedStatuses.includes(this.status)) {
      errors.push(`Status '${this.status}' is not allowed for this college`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    criteria: criteria
  };
};

// Instance method to get college criteria
teacherAttendanceSchema.methods.getCollegeCriteria = async function() {
  if (!this.college) {
    return null;
  }
  
  try {
    const CollegeAttendanceCriteria = mongoose.model('CollegeAttendanceCriteria');
    return await CollegeAttendanceCriteria.findOne({ college: this.college, isActive: true });
  } catch (error) {
    return null;
  }
};

// Static method to apply college criteria to attendance data
teacherAttendanceSchema.statics.applyCollegeCriteria = async function(attendanceData, collegeId) {
  const CollegeAttendanceCriteria = mongoose.model('CollegeAttendanceCriteria');
  const criteria = await CollegeAttendanceCriteria.findOne({ college: collegeId, isActive: true });
  
  if (!criteria) {
    return attendanceData; // Return as-is if no criteria found
  }

  // Set expected times if not provided
  if (!attendanceData.expectedCheckIn && attendanceData.date) {
    const date = attendanceData.date instanceof Date ? attendanceData.date : new Date(attendanceData.date);
    attendanceData.expectedCheckIn = criteria.getExpectedCheckInTime(date);
  }
  if (!attendanceData.expectedCheckOut && attendanceData.date) {
    const date = attendanceData.date instanceof Date ? attendanceData.date : new Date(attendanceData.date);
    attendanceData.expectedCheckOut = criteria.getExpectedCheckOutTime(date);
  }

  // Set default status if not provided
  if (!attendanceData.status && criteria.statusRules.defaultStatus) {
    attendanceData.status = criteria.statusRules.defaultStatus;
  }

  // Set default attendance method if not provided
  if (!attendanceData.attendanceMethod && criteria.attendanceMethods.primaryMethod) {
    attendanceData.attendanceMethod = criteria.attendanceMethods.primaryMethod;
  }

  // Validate working day if date is provided
  if (attendanceData.date) {
    const date = attendanceData.date instanceof Date ? attendanceData.date : new Date(attendanceData.date);
    const isWorkingDay = criteria.isWorkingDay(date);
    
    if (!isWorkingDay) {
      if (!criteria.workingDays.allowWeekendAttendance && !criteria.workingDays.allowHolidayAttendance) {
        // Don't throw error here, let validation handle it
        attendanceData.status = attendanceData.status || 'holiday';
      }
    }
  }

  return attendanceData;
};

// Ensure virtual fields are included in JSON output
teacherAttendanceSchema.set('toJSON', { virtuals: true });
teacherAttendanceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('TeacherAttendance', teacherAttendanceSchema);

