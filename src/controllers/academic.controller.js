const { validationResult } = require('express-validator');
const AcademicConfig = require('../models/academicConfig.model');
const AcademicCourse = require('../models/academicCourse.model');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

const upsertConfig = async (req, res, next) => {
  if (handleValidation(req, res)) return;
console.log(req.body);
  try {
    const update = { college: req.params.collegeId };

    if (req.body.levelNames?.A !== undefined) update['levelNames.A'] = req.body.levelNames.A;
    if (req.body.levelNames?.B !== undefined) update['levelNames.B'] = req.body.levelNames.B;
    if (req.body.levelNames?.C !== undefined) update['levelNames.C'] = req.body.levelNames.C;

    if (Array.isArray(req.body.levelValues?.A)) update['levelValues.A'] = req.body.levelValues.A;
    if (Array.isArray(req.body.levelValues?.B)) update['levelValues.B'] = req.body.levelValues.B;
    if (Array.isArray(req.body.levelValues?.C)) update['levelValues.C'] = req.body.levelValues.C;

    const config = await AcademicConfig.findOneAndUpdate(
      { college: req.params.collegeId },
      update,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
};

const getConfigByCollege = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const config = await AcademicConfig.findOne({ college: req.params.collegeId });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Academic configuration not found for this college'
      });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
};

const createCourse = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const course = await AcademicCourse.create({
      college: req.user.college,
      batch: req.body.batch,
      name: req.body.name,
      description: req.body.description,
      levelA: req.body.levelA,
      levelB: req.body.levelB,
      levelC: req.body.levelC,
      academicDuration: req.body.academicDuration,
      startDate: req.body.startDate,
      tutor: req.body.tutor,
      createdBy: req.user._id,
      completedDate: req.body.completedDate,
      seatLimit: req.body.seatLimit,
      isActive: req.body.isActive
    });

    res.status(201).json({ success: true, data: course });
  } catch (error) {
    console.log(error);
    if (error.code === 11000) {
      res
        .status(409)
        .json({ success: false, message: 'A course with this batch and name already exists for this college' });
    } else {
      next(error);
    }
  }
};

const listCourses = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const filters = {};
    if (req.query.collegeId) filters.college = req.query.collegeId;
    if (req.query.levelA) filters.levelA = req.query.levelA;
    if (req.query.levelB) filters.levelB = req.query.levelB;
    if (req.query.levelC) filters.levelC = req.query.levelC;
    if (!req.query.includeInactive) filters.isActive = true;

    const courses = await AcademicCourse.find(filters).sort({ createdAt: -1 });
    res.json({ success: true, data: courses });
  } catch (error) {
    next(error);
  }
};

const getCourseById = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const course = await AcademicCourse.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.json({ success: true, data: course });
  } catch (error) {
    next(error);
  }
};

const updateCourse = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const course = await AcademicCourse.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const {
      collegeId,
      batch,
      name,
      description,
      levelA,
      levelB,
      levelC,
      academicDuration,
      startDate,
      tutor,
      completedDate,
      seatLimit,
      isActive
    } = req.body;

    if (collegeId) course.college = collegeId;
    if (batch) course.batch = batch;
    if (name) course.name = name;
    if (description !== undefined) course.description = description;
    if (levelA) course.levelA = levelA;
    if (levelB !== undefined) course.levelB = levelB;
    if (levelC !== undefined) course.levelC = levelC;
    if (academicDuration) course.academicDuration = academicDuration;
    if (startDate) course.startDate = startDate;
    if (tutor !== undefined) course.tutor = tutor;
    if (completedDate !== undefined) course.completedDate = completedDate;
    if (seatLimit !== undefined) course.seatLimit = seatLimit;
    if (isActive !== undefined) course.isActive = isActive;

    await course.save();
    res.json({ success: true, data: course });
  } catch (error) {
    if (error.code === 11000) {
      res
        .status(409)
        .json({ success: false, message: 'A course with this batch and name already exists for this college' });
    } else {
      next(error);
    }
  }
};

const deleteCourse = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const course = await AcademicCourse.findByIdAndDelete(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const promoteLevelCValue = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const course = await AcademicCourse.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const {
      levelC,
    } = req.body;

    if (levelC !== undefined) course.levelC = levelC;

    await course.save();
    res.json({ success: true, data: course });
  } catch (error) {
    if (error.code === 11000) {
      res
        .status(409)
        .json({ success: false, message: 'A course with this batch and name already exists for this college' });
    } else {
      next(error);
    }
  }
};

module.exports = {
  upsertConfig,
  getConfigByCollege,
  createCourse,
  listCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  promoteLevelCValue
};

