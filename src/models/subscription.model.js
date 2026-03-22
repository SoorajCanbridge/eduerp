const mongoose = require('mongoose');

const STATUS_VALUES = ['active', 'cancelled', 'expired', 'trial', 'past_due'];
const BILLING_CYCLES = ['monthly', 'yearly'];

const subscriptionSchema = new mongoose.Schema(
  {
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true
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
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      default: null
    },
    status: {
      type: String,
      required: true,
      trim: true,
      enum: STATUS_VALUES,
      default: 'active'
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    endDate: {
      type: Date,
      required: true
    },
    billingCycle: {
      type: String,
      trim: true,
      enum: BILLING_CYCLES,
      default: 'yearly'
    },
    // Optional: for display or reporting (amount in smallest unit e.g. paise)
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
    // Plan limits (enforce in app when needed)
    limits: {
      maxStudents: { type: Number, min: 0, default: null },
      maxTeachers: { type: Number, min: 0, default: null },
      maxCourses: { type: Number, min: 0, default: null },
      maxStorageMB: { type: Number, min: 0, default: null }
    },
    // Trial
    trialEndsAt: {
      type: Date,
      default: null
    },
    // Cancellation
    cancelledAt: {
      type: Date,
      default: null
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    cancelReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null
    },
    autoRenew: {
      type: Boolean,
      default: true
    },
    renewalHistory: [
      {
        renewedAt: { type: Date, required: true, default: Date.now },
        previousEndDate: { type: Date, required: true },
        newEndDate: { type: Date, required: true },
        renewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
      }
    ],
    paymentHistory: [
      {
        paidAt: { type: Date, required: true, default: Date.now },
        amount: { type: Number, min: 0, required: true },
        currency: { type: String, trim: true, uppercase: true, default: 'INR', maxlength: 3 },
        paymentRef: { type: String, trim: true, maxlength: 200, default: null },
        periodStart: { type: Date, required: true },
        periodEnd: { type: Date, required: true },
        paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
      }
    ],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// endDate must be after startDate
subscriptionSchema.path('endDate').validate(function (value) {
  if (!this.startDate || !value) return true;
  return value > this.startDate;
}, 'endDate must be after startDate');

subscriptionSchema.virtual('isActive').get(function () {
  if (this.status === 'cancelled' || this.status === 'expired') return false;
  return this.endDate ? new Date() <= new Date(this.endDate) : true;
});

subscriptionSchema.virtual('isExpired').get(function () {
  return this.endDate ? new Date() > new Date(this.endDate) : false;
});

subscriptionSchema.virtual('daysRemaining').get(function () {
  if (!this.endDate || this.isExpired) return 0;
  const diff = new Date(this.endDate) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

subscriptionSchema.index({ college: 1 });
subscriptionSchema.index({ createdBy: 1 });
subscriptionSchema.index({ createdCollege: 1 });
subscriptionSchema.index({ cancelledBy: 1 });
subscriptionSchema.index({ status: 1, endDate: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ endDate: 1 }); // for cron jobs finding expiring soon

module.exports = mongoose.model('Subscription', subscriptionSchema);
module.exports.STATUS_VALUES = STATUS_VALUES;
module.exports.BILLING_CYCLES = BILLING_CYCLES;
