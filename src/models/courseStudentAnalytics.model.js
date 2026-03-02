const mongoose = require('mongoose');

const periodTypes = ['day', 'week', 'month', 'year', 'total'];

const courseStatsSchema = new mongoose.Schema(
  {
    created: { type: Number, default: 0, min: 0 },
    active: { type: Number, default: 0, min: 0 },
    completed: { type: Number, default: 0, min: 0 },
    cancelled: { type: Number, default: 0, min: 0 },
    totalEnrolled: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const studentStatsSchema = new mongoose.Schema(
  {
    enrolled: { type: Number, default: 0, min: 0 },
    graduated: { type: Number, default: 0, min: 0 },
    dropped: { type: Number, default: 0, min: 0 },
    suspended: { type: Number, default: 0, min: 0 },
    transferred: { type: Number, default: 0, min: 0 },
    active: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const courseStudentAnalyticsSchema = new mongoose.Schema(
  {
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true
    },
    periodType: {
      type: String,
      enum: periodTypes,
      required: true
    },
    periodKey: {
      type: String,
      required: true,
      trim: true
    },
    periodStart: {
      type: Date,
      required: function () {
        return this.periodType !== 'total';
      }
    },
    periodEnd: {
      type: Date
    },
    course: {
      type: courseStatsSchema,
      default: () => ({})
    },
    student: {
      type: studentStatsSchema,
      default: () => ({})
    }
  },
  { timestamps: true }
);

courseStudentAnalyticsSchema.index({ college: 1, periodType: 1, periodKey: 1 }, { unique: true });
courseStudentAnalyticsSchema.index({ college: 1, periodType: 1, periodStart: 1 });
courseStudentAnalyticsSchema.index({ college: 1, periodStart: 1, periodEnd: 1 });

module.exports = mongoose.model('CourseStudentAnalytics', courseStudentAnalyticsSchema);
module.exports.periodTypes = periodTypes;
