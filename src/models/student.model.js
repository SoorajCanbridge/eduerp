const mongoose = require('mongoose');

const enrollmentStatuses = ['enrolled', 'graduated', 'dropped', 'suspended', 'transferred'];

const studentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    rollNumber: {
      type: String,
      trim: true
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
      enum: ['male', 'female', 'other'],
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
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicCourse',
      required: true
    },
    enrollmentDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    enrollmentStatus: {
      type: String,
      enum: enrollmentStatuses,
      default: 'enrolled'
    },
    graduationDate: {
      type: Date
    },
    guardianInfo: {
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
    academicRecords: {
      currentSemester: {
        type: Number,
        min: 1
      },
      cgpa: {
        type: Number,
        min: 0,
        max: 10
      },
      attendance: {
        type: Number,
        min: 0,
        max: 100
      }
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
      previousMarksheet: {
        type: String,
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
studentSchema.index({ college: 1, studentId: 1 }, { unique: true });
studentSchema.index({ college: 1 });
studentSchema.index({ course: 1 });
studentSchema.index({ enrollmentStatus: 1 });
studentSchema.index({ phone: 1 });

// Virtual for age calculation
studentSchema.virtual('age').get(function () {
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

// Ensure virtuals are included in JSON output
studentSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Student', studentSchema);

