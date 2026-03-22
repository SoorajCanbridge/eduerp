const mongoose = require('mongoose');

const BILLING_CYCLES = ['monthly', 'yearly'];

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
      default: null
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null
    },
    billingCycle: {
      type: String,
      required: true,
      trim: true,
      enum: BILLING_CYCLES,
      default: 'yearly'
    },
    amount: {
      type: Number,
      min: 0,
      default: 0
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'INR',
      maxlength: 3
    },
    limits: {
      maxStudents: { type: Number, min: 0, default: null },
      maxTeachers: { type: Number, min: 0, default: null },
      maxCourses: { type: Number, min: 0, default: null },
      maxStorageMB: { type: Number, min: 0, default: null }
    },
    trialDays: {
      type: Number,
      min: 0,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    createdCollege: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      default: null
    }
  },
  { timestamps: true }
);

planSchema.index({ createdCollege: 1 });
planSchema.index({ createdBy: 1 });
planSchema.index({ isActive: 1 });
planSchema.index({ createdCollege: 1, code: 1 }, { sparse: true, unique: true });

module.exports = mongoose.model('Plan', planSchema);
module.exports.BILLING_CYCLES = BILLING_CYCLES;
