const analyticsService = require('../services/analytics.service');

const getCourseStudentAnalytics = async (req, res, next) => {
  try {
    const collegeId = req.query.collegeId || req.user?.college;
    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'collegeId is required (query or user college)'
      });
    }

    const periodType = req.query.periodType;
    const periodKey = req.query.periodKey;
    const from = req.query.from;
    const to = req.query.to;

    const data = await analyticsService.getAnalytics(collegeId, {
      periodType,
      periodKey,
      from,
      to
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getSummaryByPeriod = async (req, res, next) => {
  try {
    const collegeId = req.query.collegeId || req.user?.college;
    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'collegeId is required (query or user college)'
      });
    }

    const periodType = req.query.periodType || 'month';
    const data = await analyticsService.getAnalytics(collegeId, { periodType });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const rebuildTotal = async (req, res, next) => {
  try {
    const collegeId = req.params.collegeId || req.user?.college;
    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'collegeId is required'
      });
    }

    await analyticsService.rebuildTotalForCollege(collegeId);
    const [totalDoc] = await analyticsService.getAnalytics(collegeId, {
      periodType: 'total',
      periodKey: 'all'
    });

    res.json({
      success: true,
      message: 'Total analytics rebuilt for college',
      data: totalDoc
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCourseStudentAnalytics,
  getSummaryByPeriod,
  rebuildTotal
};
