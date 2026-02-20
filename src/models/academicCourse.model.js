const mongoose = require('mongoose');

const academicCourseSchema = new mongoose.Schema(
  {
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true
    },
    batch: {
      type: String,
      required: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2
    },
    description: {
      type: String,
      trim: true
    },
    levelA: {
      type: String,
      required: true,
      trim: true
    },
    levelB: {
      type: String,
      trim: true
    },
    levelC: {
      type: String,
      trim: true
    },
    academicDuration: {
      value: {
        type: Number,
        required: true,
        min: 1
      },
      unit: {
        type: String,
        required: true,
        enum: ['day', 'week', 'month', 'year'],
        lowercase: true
      }
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date
    },
    tutor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    completedDate: {
      type: Date
    },
    seatLimit: {
      type: Number,
      required: true,
      min: 1
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

// Pre-save hook to calculate endDate from startDate and academicDuration
academicCourseSchema.pre('save', function (next) {
  if (this.startDate && this.academicDuration && this.academicDuration.value && this.academicDuration.unit) {
    const startDate = new Date(this.startDate);
    const duration = this.academicDuration.value;
    const unit = this.academicDuration.unit;
    
    const endDate = new Date(startDate);
    
    switch (unit) {
      case 'day':
        endDate.setDate(endDate.getDate() + duration);
        break;
      case 'week':
        endDate.setDate(endDate.getDate() + (duration * 7));
        break;
      case 'month':
        endDate.setMonth(endDate.getMonth() + duration);
        break;
      case 'year':
        endDate.setFullYear(endDate.getFullYear() + duration);
        break;
    }
    
    // Subtract one day to make it inclusive (e.g., if start is Jan 1 and duration is 1 day, end is Jan 1)
    // Or keep it as is if you want exclusive (e.g., if start is Jan 1 and duration is 1 day, end is Jan 2)
    // For academic purposes, typically we want: if start is Jan 1 and duration is 1 month, end is Jan 31
    // So we subtract 1 day to make the end date inclusive
    endDate.setDate(endDate.getDate() - 1);
    
    this.endDate = endDate;
  }
  // next();
});

academicCourseSchema.index({ college: 1, batch: 1, name: 1 });
academicCourseSchema.index({ college: 1, levelA: 1, levelB: 1, levelC: 1 });

module.exports = mongoose.model('AcademicCourse', academicCourseSchema);

