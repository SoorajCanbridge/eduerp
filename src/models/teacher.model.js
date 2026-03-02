const mongoose = require('mongoose');

const employmentStatuses = ['active', 'on-leave', 'resigned', 'retired', 'terminated'];
const staffTypes = ['teaching', 'non-teaching'];
const teachingDesignations = ['professor', 'associate-professor', 'assistant-professor', 'lecturer', 'visiting-faculty', 'guest-faculty'];
const nonTeachingDesignations = ['principal', 'vice-principal', 'registrar', 'admin-officer', 'accountant', 'clerk', 'librarian', 'lab-technician', 'lab-assistant', 'peon', 'security-guard', 'maintenance-staff', 'canteen-staff', 'driver', 'nurse', 'counselor', 'it-support', 'hr-officer', 'store-keeper', 'other'];
const allDesignations = [...teachingDesignations, ...nonTeachingDesignations];
const genders = ['male', 'female', 'other'];
const shifts = ['day', 'night', 'general'];

const teacherSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    alternatePhone: {
      type: String,
      trim: true
    },
    dateOfBirth: {
      type: Date,
      required: true
    },
    gender: {
      type: String,
      enum: genders,
      required: true
    },
    image: {
      type: String,
      trim: true
    },
    address: {
      street: {
        type: String,
        trim: true
      },
      city: {
        type: String,
        required: true,
        trim: true
      },
      state: {
        type: String,
        required: true,
        trim: true
      },
      pincode: {
        type: String,
        required: true,
        trim: true,
        match: /^[0-9]{6}$/
      },
      country: {
        type: String,
        default: 'India',
        trim: true
      }
    },
    staffType: {
      type: String,
      enum: staffTypes,
      required: true,
      default: 'teaching'
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true
    },
    department: {
      type: String,
      required: true,
      trim: true
    },
    designation: {
      type: String,
      enum: allDesignations,
      required: true
    },
    // Non-teaching staff specific fields
    role: {
      type: String,
      trim: true
    },
    office: {
      type: String,
      trim: true
    },
    workLocation: {
      type: String,
      trim: true
    },
    shift: {
      type: String,
      enum: shifts,
      default: 'general'
    },
    reportingTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher'
    },
    specialization: {
      type: [String],
      default: []
    },
    qualifications: {
      type: [
        {
          degree: {
            type: String,
            required: true,
            trim: true
          },
          institution: {
            type: String,
            trim: true
          },
          year: {
            type: Number,
            min: 1950,
            max: new Date().getFullYear()
          },
          percentage: {
            type: Number,
            min: 0,
            max: 100
          }
        }
      ],
      default: []
    },
    experience: {
      totalYears: {
        type: Number,
        min: 0,
        default: 0
      },
      teachingYears: {
        type: Number,
        min: 0,
        default: 0
      },
      industryYears: {
        type: Number,
        min: 0,
        default: 0
      },
      administrativeYears: {
        type: Number,
        min: 0,
        default: 0
      }
    },
    // Teaching staff specific fields
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicCourse'
      }
    ],
    joiningDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    employmentStatus: {
      type: String,
      enum: employmentStatuses,
      default: 'active'
    },
    salary: {
      type: Number,
      min: 0
    },
    documents: {
      aadhar: {
        type: String,
        trim: true
      },
      pan: {
        type: String,
        trim: true
      },
      certificates: [
        {
          type: String,
          trim: true
        }
      ]
    },
    emergencyContact: {
      name: {
        type: String,
        trim: true
      },
      relation: {
        type: String,
        trim: true
      },
      phone: {
        type: String,
        trim: true
      },
      email: {
        type: String,
        lowercase: true,
        trim: true
      }
    },
    isActive: {
      type: Boolean,
      default: true
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

// Indexes for efficient queries
teacherSchema.index({ college: 1, employeeId: 1 }, { unique: true });
teacherSchema.index({ college: 1 });
teacherSchema.index({ department: 1 });
teacherSchema.index({ designation: 1 });
teacherSchema.index({ employmentStatus: 1 });
teacherSchema.index({ phone: 1 });
teacherSchema.index({ courses: 1 });
teacherSchema.index({ staffType: 1 });
teacherSchema.index({ staffType: 1, college: 1 });

// Validation middleware
teacherSchema.pre('save', function (next) {
  // Validate designation matches staff type
  if (this.staffType === 'teaching' && !teachingDesignations.includes(this.designation)) {
    return next(new Error(`Designation '${this.designation}' is not valid for teaching staff. Valid designations: ${teachingDesignations.join(', ')}`));
  }
  
  if (this.staffType === 'non-teaching' && !nonTeachingDesignations.includes(this.designation)) {
    return next(new Error(`Designation '${this.designation}' is not valid for non-teaching staff. Valid designations: ${nonTeachingDesignations.join(', ')}`));
  }

  // Clear courses for non-teaching staff
  if (this.staffType === 'non-teaching' && this.courses && this.courses.length > 0) {
    this.courses = [];
  }

  // Clear teachingYears for non-teaching staff if set
  if (this.staffType === 'non-teaching' && this.experience && this.experience.teachingYears > 0) {
    this.experience.teachingYears = 0;
  }


});

// Virtual for age calculation
teacherSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Virtual for years of service
teacherSchema.virtual('yearsOfService').get(function () {
  if (!this.joiningDate) return null;
  const today = new Date();
  const joinDate = new Date(this.joiningDate);
  let years = today.getFullYear() - joinDate.getFullYear();
  const monthDiff = today.getMonth() - joinDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < joinDate.getDate())) {
    years--;
  }
  return years;
});

// Ensure virtuals are included in JSON output
teacherSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Teacher', teacherSchema);

