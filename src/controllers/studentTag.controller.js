const { validationResult } = require('express-validator');
const StudentTag = require('../models/studentTag.model');
const Student = require('../models/student.model');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

/** @returns {import('mongoose').Types.ObjectId|null} null if response was sent */
const getUserCollegeOrRespond = (req, res) => {
  if (!req.user.college) {
    res.status(403).json({
      success: false,
      message: 'College context is required to access student tags'
    });
    return null;
  }
  return req.user.college;
};

const getAllStudentTags = async (req, res, next) => {
  try {
    const college = getUserCollegeOrRespond(req, res);
    if (!college) return;

    const tags = await StudentTag.find({ college })
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ name: 1 });

    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
};

const getStudentTagById = async (req, res, next) => {
  try {
    const college = getUserCollegeOrRespond(req, res);
    if (!college) return;

    const tag = await StudentTag.findOne({ _id: req.params.id, college })
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!tag) {
      return res.status(404).json({ success: false, message: 'Student tag not found' });
    }

    res.json({ success: true, data: tag });
  } catch (error) {
    next(error);
  }
};

const createStudentTag = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const college = getUserCollegeOrRespond(req, res);
    if (!college) return;

    const tag = await StudentTag.create({
      name: req.body.name,
      description: req.body.description,
      color: req.body.color,
      college,
      createdBy: req.user._id
    });

    const populated = await StudentTag.findById(tag._id)
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'A student tag with this name already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const updateStudentTag = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const college = getUserCollegeOrRespond(req, res);
    if (!college) return;

    const tag = await StudentTag.findOne({ _id: req.params.id, college });
    if (!tag) {
      return res.status(404).json({ success: false, message: 'Student tag not found' });
    }

    if (req.body.name !== undefined) tag.name = req.body.name;
    if (req.body.description !== undefined) tag.description = req.body.description;
    if (req.body.color !== undefined) tag.color = req.body.color;

    tag.updatedBy = req.user._id;
    await tag.save();

    const updated = await StudentTag.findById(tag._id)
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'A student tag with this name already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const deleteStudentTag = async (req, res, next) => {
  try {
    const college = getUserCollegeOrRespond(req, res);
    if (!college) return;

    const inUse = await Student.exists({ tags: req.params.id, college });
    if (inUse) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete tag while it is assigned to one or more students'
      });
    }

    const tag = await StudentTag.findOneAndDelete({ _id: req.params.id, college });
    if (!tag) {
      return res.status(404).json({ success: false, message: 'Student tag not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllStudentTags,
  getStudentTagById,
  createStudentTag,
  updateStudentTag,
  deleteStudentTag
};
