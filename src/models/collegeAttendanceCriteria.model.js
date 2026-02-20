const mongoose = require('mongoose');

const collegeAttendanceCriteriaSchema = new mongoose.Schema(
  {
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true,
      unique: true
    },
    // Time Settings
    timeSettings: {
      expectedCheckIn: {
        type: String, // Format: "HH:mm" (e.g., "09:00")
        default: '09:00',
        required: true
      },
      expectedCheckOut: {
        type: String, // Format: "HH:mm" (e.g., "17:00")
        default: '17:00',
        required: true
      },
      workingHoursPerDay: {
        type: Number,
        min: 1,
        max: 24,
        default: 8,
        required: true
      },
      halfDayHours: {
        type: Number,
        min: 1,
        max: 12,
        default: 4
      },
      breakDuration: {
        type: Number, // in minutes
        min: 0,
        max: 480,
        default: 60
      },
      breakStartTime: {
        type: String, // Format: "HH:mm"
        default: '13:00'
      },
      breakEndTime: {
        type: String, // Format: "HH:mm"
        default: '14:00'
      },
      flexibleTiming: {
        type: Boolean,
        default: false
      },
      flexibleCheckInWindow: {
        type: Number, // minutes before/after expected time
        min: 0,
        default: 30
      }
    },
    // Tolerance Settings
    toleranceSettings: {
      lateArrivalTolerance: {
        type: Number, // minutes
        min: 0,
        default: 15,
        required: true
      },
      earlyDepartureTolerance: {
        type: Number, // minutes
        min: 0,
        default: 15,
        required: true
      },
      autoMarkLateAfter: {
        type: Number, // minutes after expected check-in
        min: 0,
        default: 30
      },
      autoMarkEarlyLeaveAfter: {
        type: Number, // minutes before expected check-out
        min: 0,
        default: 30
      },
      requireApprovalForLate: {
        type: Boolean,
        default: true
      },
      requireApprovalForEarlyLeave: {
        type: Boolean,
        default: true
      },
      requireApprovalAfterMinutes: {
        type: Number, // minutes late/early that require approval
        min: 0,
        default: 30
      }
    },
    // Attendance Methods
    attendanceMethods: {
      allowedMethods: [{
        type: String,
        enum: ['manual', 'biometric', 'mobile-app', 'web-portal', 'rfid', 'face-recognition', 'other'],
        default: ['manual', 'mobile-app', 'web-portal']
      }],
      primaryMethod: {
        type: String,
        enum: ['manual', 'biometric', 'mobile-app', 'web-portal', 'rfid', 'face-recognition', 'other'],
        default: 'manual'
      },
      requirePhotoVerification: {
        type: Boolean,
        default: false
      },
      requireLocationVerification: {
        type: Boolean,
        default: false
      },
      allowMultipleCheckIns: {
        type: Boolean,
        default: false
      },
      allowMultipleCheckOuts: {
        type: Boolean,
        default: false
      }
    },
    // Location Settings (Geofencing)
    locationSettings: {
      enabled: {
        type: Boolean,
        default: false
      },
      checkInLocation: {
        latitude: {
          type: Number,
          min: -90,
          max: 90
        },
        longitude: {
          type: Number,
          min: -180,
          max: 180
        },
        address: {
          type: String,
          trim: true
        },
        radius: {
          type: Number, // in meters
          min: 10,
          default: 100
        }
      },
      checkOutLocation: {
        latitude: {
          type: Number,
          min: -90,
          max: 90
        },
        longitude: {
          type: Number,
          min: -180,
          max: 180
        },
        address: {
          type: String,
          trim: true
        },
        radius: {
          type: Number, // in meters
          min: 10,
          default: 100
        }
      },
      allowDifferentLocations: {
        type: Boolean,
        default: true
      },
      strictLocationCheck: {
        type: Boolean,
        default: false
      }
    },
    // Working Days & Holidays
    workingDays: {
      monday: {
        type: Boolean,
        default: true
      },
      tuesday: {
        type: Boolean,
        default: true
      },
      wednesday: {
        type: Boolean,
        default: true
      },
      thursday: {
        type: Boolean,
        default: true
      },
      friday: {
        type: Boolean,
        default: true
      },
      saturday: {
        type: Boolean,
        default: false
      },
      sunday: {
        type: Boolean,
        default: false
      },
      allowWeekendAttendance: {
        type: Boolean,
        default: false
      },
      allowHolidayAttendance: {
        type: Boolean,
        default: false
      },
      customHolidays: [{
        date: {
          type: Date,
          required: true
        },
        name: {
          type: String,
          trim: true,
          required: true
        },
        isWorkingDay: {
          type: Boolean,
          default: false
        }
      }]
    },
    // Overtime Settings
    overtimeSettings: {
      enabled: {
        type: Boolean,
        default: true
      },
      standardHours: {
        type: Number,
        min: 1,
        max: 24,
        default: 8
      },
      overtimeThreshold: {
        type: Number, // hours after which overtime is calculated
        min: 0,
        default: 8
      },
      requireOvertimeApproval: {
        type: Boolean,
        default: true
      },
      overtimeRate: {
        type: Number, // multiplier (e.g., 1.5 for 1.5x)
        min: 1,
        default: 1.5
      },
      allowOvertimeOnWeekends: {
        type: Boolean,
        default: true
      },
      allowOvertimeOnHolidays: {
        type: Boolean,
        default: true
      }
    },
    // Status Rules
    statusRules: {
      allowedStatuses: [{
        type: String,
        enum: [
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
        ],
        default: [
          'present',
          'absent',
          'half-day',
          'leave',
          'holiday',
          'late',
          'early-leave',
          'work-from-home'
        ]
      }],
      defaultStatus: {
        type: String,
        enum: [
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
        ],
        default: 'present'
      },
      autoStatusDetection: {
        type: Boolean,
        default: true
      },
      statusBasedWorkingHours: {
        present: {
          type: Number,
          default: 8
        },
        'half-day': {
          type: Number,
          default: 4
        },
        'work-from-home': {
          type: Number,
          default: 8
        },
        'on-duty': {
          type: Number,
          default: 8
        },
        training: {
          type: Number,
          default: 8
        },
        meeting: {
          type: Number,
          default: 8
        },
        conference: {
          type: Number,
          default: 8
        }
      }
    },
    // Leave Settings
    leaveSettings: {
      allowedLeaveTypes: [{
        type: String,
        enum: ['casual', 'sick', 'earned', 'unpaid', 'maternity', 'paternity', 'compensatory', 'sabbatical', 'other'],
        default: ['casual', 'sick', 'earned', 'unpaid', 'other']
      }],
      requireLeaveApproval: {
        type: Boolean,
        default: true
      },
      allowHalfDayLeave: {
        type: Boolean,
        default: true
      },
      maxLeaveDaysPerMonth: {
        type: Number,
        min: 0,
        default: 0 // 0 means unlimited
      },
      maxLeaveDaysPerYear: {
        type: Number,
        min: 0,
        default: 0 // 0 means unlimited
      },
      leaveBalanceTracking: {
        type: Boolean,
        default: true
      }
    },
    // Approval Workflow
    approvalWorkflow: {
      enabled: {
        type: Boolean,
        default: true
      },
      autoApproveWithinTolerance: {
        type: Boolean,
        default: true
      },
      approvalHierarchy: [{
        level: {
          type: Number,
          required: true,
          min: 1
        },
        role: {
          type: String,
          trim: true
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
      requireMultipleApprovals: {
        type: Boolean,
        default: false
      },
      minApprovalsRequired: {
        type: Number,
        min: 1,
        default: 1
      },
      allowSelfApproval: {
        type: Boolean,
        default: false
      },
      approvalTimeout: {
        type: Number, // hours
        min: 1,
        default: 24
      }
    },
    // Regularization Settings
    regularizationSettings: {
      enabled: {
        type: Boolean,
        default: true
      },
      allowRegularization: {
        type: Boolean,
        default: true
      },
      maxRegularizationDays: {
        type: Number,
        min: 0,
        default: 7 // days after attendance date
      },
      requireRegularizationReason: {
        type: Boolean,
        default: true
      },
      requireRegularizationApproval: {
        type: Boolean,
        default: true
      }
    },
    // Notification Settings
    notificationSettings: {
      notifyOnLateArrival: {
        type: Boolean,
        default: true
      },
      notifyOnEarlyLeave: {
        type: Boolean,
        default: true
      },
      notifyOnAbsence: {
        type: Boolean,
        default: true
      },
      notifyOnOvertime: {
        type: Boolean,
        default: true
      },
      notifyOnPendingApproval: {
        type: Boolean,
        default: true
      },
      notificationChannels: [{
        type: String,
        enum: ['email', 'sms', 'push', 'in-app'],
        default: ['email', 'in-app']
      }]
    },
    // Advanced Settings
    advancedSettings: {
      allowBackdateEntry: {
        type: Boolean,
        default: true
      },
      maxBackdateDays: {
        type: Number,
        min: 0,
        default: 7
      },
      allowFutureDateEntry: {
        type: Boolean,
        default: false
      },
      maxFutureDateDays: {
        type: Number,
        min: 0,
        default: 0
      },
      requireRemarksForAbsence: {
        type: Boolean,
        default: false
      },
      requireRemarksForLeave: {
        type: Boolean,
        default: true
      },
      trackIPAddress: {
        type: Boolean,
        default: false
      },
      trackDeviceInfo: {
        type: Boolean,
        default: false
      },
      enableAttendanceReports: {
        type: Boolean,
        default: true
      },
      attendanceReportFrequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
        default: 'monthly'
      }
    },
    // Active Status
    isActive: {
      type: Boolean,
      default: true
    },
    // Metadata
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

// Indexes
collegeAttendanceCriteriaSchema.index({ college: 1 }, { unique: true });
collegeAttendanceCriteriaSchema.index({ isActive: 1 });

// Instance method to get expected check-in time as Date
collegeAttendanceCriteriaSchema.methods.getExpectedCheckInTime = function(date = new Date()) {
  const [hours, minutes] = this.timeSettings.expectedCheckIn.split(':');
  const expectedTime = new Date(date);
  expectedTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return expectedTime;
};

// Instance method to get expected check-out time as Date
collegeAttendanceCriteriaSchema.methods.getExpectedCheckOutTime = function(date = new Date()) {
  const [hours, minutes] = this.timeSettings.expectedCheckOut.split(':');
  const expectedTime = new Date(date);
  expectedTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return expectedTime;
};

// Instance method to check if location is within allowed radius
collegeAttendanceCriteriaSchema.methods.isLocationValid = function(latitude, longitude, isCheckIn = true) {
  if (!this.locationSettings.enabled) {
    return true; // Location check disabled
  }

  const targetLocation = isCheckIn ? this.locationSettings.checkInLocation : this.locationSettings.checkOutLocation;
  
  if (!targetLocation.latitude || !targetLocation.longitude) {
    return true; // No location set, allow all
  }

  // Haversine formula to calculate distance
  const R = 6371000; // Earth's radius in meters
  const dLat = (latitude - targetLocation.latitude) * Math.PI / 180;
  const dLon = (longitude - targetLocation.longitude) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(targetLocation.latitude * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in meters

  return distance <= targetLocation.radius;
};

// Instance method to check if date is a working day
collegeAttendanceCriteriaSchema.methods.isWorkingDay = function(date = new Date()) {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];

  // Check if it's a working day
  if (this.workingDays[dayName]) {
    // Check if it's a custom holiday
    const dateStr = date.toISOString().split('T')[0];
    const customHoliday = this.workingDays.customHolidays.find(h => {
      const holidayDateStr = new Date(h.date).toISOString().split('T')[0];
      return holidayDateStr === dateStr && !h.isWorkingDay;
    });
    return !customHoliday;
  }

  // Check if it's a custom working day (holiday that's a working day)
  const dateStr = date.toISOString().split('T')[0];
  const customWorkingDay = this.workingDays.customHolidays.find(h => {
    const holidayDateStr = new Date(h.date).toISOString().split('T')[0];
    return holidayDateStr === dateStr && h.isWorkingDay;
  });
  return !!customWorkingDay;
};

// Instance method to check if attendance method is allowed
collegeAttendanceCriteriaSchema.methods.isMethodAllowed = function(method) {
  return this.attendanceMethods.allowedMethods.includes(method);
};

// Instance method to check if status requires approval
collegeAttendanceCriteriaSchema.methods.requiresApproval = function(lateMinutes, earlyMinutes, status) {
  if (!this.approvalWorkflow.enabled) {
    return false;
  }

  if (this.approvalWorkflow.autoApproveWithinTolerance) {
    if (lateMinutes <= this.toleranceSettings.lateArrivalTolerance &&
        earlyMinutes <= this.toleranceSettings.earlyDepartureTolerance) {
      return false;
    }
  }

  if (status === 'late' && this.toleranceSettings.requireApprovalForLate) {
    return lateMinutes > this.toleranceSettings.requireApprovalAfterMinutes;
  }

  if (status === 'early-leave' && this.toleranceSettings.requireApprovalForEarlyLeave) {
    return earlyMinutes > this.toleranceSettings.requireApprovalAfterMinutes;
  }

  return false;
};

// Static method to get or create default criteria for a college
collegeAttendanceCriteriaSchema.statics.getOrCreateDefault = async function(collegeId, createdBy) {
  let criteria = await this.findOne({ college: collegeId });
  
  if (!criteria) {
    criteria = await this.create({
      college: collegeId,
      createdBy: createdBy
    });
  }
  
  return criteria;
};

// Ensure virtual fields are included in JSON output
collegeAttendanceCriteriaSchema.set('toJSON', { virtuals: true });
collegeAttendanceCriteriaSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CollegeAttendanceCriteria', collegeAttendanceCriteriaSchema);

