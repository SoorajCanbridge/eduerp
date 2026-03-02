const CourseStudentAnalytics = require('../models/courseStudentAnalytics.model');

/**
 * Get period key strings for a given date (for day, week, month, year).
 * @param {Date} date
 * @returns {{ day: string, week: string, month: string, year: string }}
 */
function getPeriodKeys(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const iso = getISOWeek(d);
  const weekNum = String(iso.week).padStart(2, '0');
  return {
    day: `${y}-${m}-${day}`,
    week: `${y}-W${weekNum}`,
    month: `${y}-${m}`,
    year: String(y)
  };
}

function getISOWeek(d) {
  const target = new Date(d);
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - target) / 604800000);
  return { year: target.getFullYear(), week };
}

function getPeriodBounds(periodType, periodKey) {
  let periodStart, periodEnd;
  if (periodType === 'day') {
    periodStart = new Date(periodKey + 'T00:00:00.000Z');
    periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
  } else if (periodType === 'week') {
    const match = periodKey.match(/^(\d{4})-W(\d{2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const week = parseInt(match[2], 10);
      const jan4 = new Date(year, 0, 4);
      const dayNr = (jan4.getDay() + 6) % 7;
      periodStart = new Date(year, 0, 1 + (week - 1) * 7 - dayNr);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 7);
    }
  } else if (periodType === 'month') {
    const [y, m] = periodKey.split('-').map(Number);
    periodStart = new Date(y, m - 1, 1);
    periodEnd = new Date(y, m, 1);
  } else if (periodType === 'year') {
    const y = parseInt(periodKey, 10);
    periodStart = new Date(y, 0, 1);
    periodEnd = new Date(y + 1, 0, 1);
  }
  return { periodStart, periodEnd };
}

/**
 * Increment course and/or student stats for the given college and date.
 * Updates day, week, month, year, and total buckets.
 * @param {ObjectId} collegeId
 * @param {Date} date - event date (e.g. createdAt, enrollmentDate)
 * @param {Object} increments - e.g. { course: { created: 1 }, student: { enrolled: 1, active: 1 } }
 */
async function recordAnalytics(collegeId, date, increments = {}) {
  const keys = getPeriodKeys(date);
  const periods = [
    { periodType: 'day', periodKey: keys.day },
    { periodType: 'week', periodKey: keys.week },
    { periodType: 'month', periodKey: keys.month },
    { periodType: 'year', periodKey: keys.year },
    { periodType: 'total', periodKey: 'all' }
  ];

  const bulkOps = [];
  for (const { periodType, periodKey } of periods) {
    const bounds = periodType !== 'total' ? getPeriodBounds(periodType, periodKey) : {};
    const update = {
      $set: {
        college: collegeId,
        periodType,
        periodKey,
        ...(bounds.periodStart && { periodStart: bounds.periodStart }),
        ...(bounds.periodEnd && { periodEnd: bounds.periodEnd })
      }
    };
    const inc = {};
    if (increments.course && Object.keys(increments.course).length) {
      Object.entries(increments.course).forEach(([k, v]) => {
        if (v !== 0) inc['course.' + k] = v;
      });
    }
    if (increments.student && Object.keys(increments.student).length) {
      Object.entries(increments.student).forEach(([k, v]) => {
        if (v !== 0) inc['student.' + k] = v;
      });
    }
    if (Object.keys(inc).length) update.$inc = inc;

    bulkOps.push({
      updateOne: {
        filter: { college: collegeId, periodType, periodKey },
        update,
        upsert: true
      }
    });
  }

  if (bulkOps.length) {
    await CourseStudentAnalytics.bulkWrite(bulkOps);
  }
}

/**
 * Get analytics for a college, optionally filtered by period type and/or key.
 */
async function getAnalytics(collegeId, options = {}) {
  const { periodType, periodKey, from, to } = options;
  const filter = { college: collegeId };

  if (periodType) filter.periodType = periodType;
  if (periodKey) filter.periodKey = periodKey;
  if (from || to) {
    filter.periodStart = {};
    if (from) filter.periodStart.$gte = new Date(from);
    if (to) filter.periodStart.$lte = new Date(to);
  }

  const docs = await CourseStudentAnalytics.find(filter)
    .sort({ periodType: 1, periodStart: 1 })
    .lean();

  return docs;
}

/**
 * Rebuild total bucket for a college from current DB counts (e.g. for backfill).
 * Does not modify day/week/month/year; only ensures total is in sync.
 */
async function rebuildTotalForCollege(collegeId) {
  const AcademicCourse = require('../models/academicCourse.model');
  const Student = require('../models/student.model');

  const [courseCounts, studentCounts] = await Promise.all([
    AcademicCourse.aggregate([
      { $match: { college: collegeId } },
      { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }
    ]),
    Student.aggregate([
      { $match: { college: collegeId } },
      { $group: { _id: '$enrollmentStatus', count: { $sum: 1 } } }
    ]),
  ]);

  const course = courseCounts[0] || { total: 0, active: 0 };
  const byStatus = Object.fromEntries((studentCounts || []).map((s) => [s._id, s.count]));

  await CourseStudentAnalytics.findOneAndUpdate(
    { college: collegeId, periodType: 'total', periodKey: 'all' },
    {
      $set: {
        college: collegeId,
        periodType: 'total',
        periodKey: 'all',
        course: {
          created: course.total,
          active: course.active,
          completed: 0,
          cancelled: 0,
          totalEnrolled: course.total
        },
        student: {
          enrolled: byStatus.enrolled || 0,
          graduated: byStatus.graduated || 0,
          dropped: byStatus.dropped || 0,
          suspended: byStatus.suspended || 0,
          transferred: byStatus.transferred || 0,
          active: byStatus.enrolled || 0
        }
      }
    },
    { upsert: true }
  );
}

module.exports = {
  getPeriodKeys,
  getPeriodBounds,
  recordAnalytics,
  getAnalytics,
  rebuildTotalForCollege
};
