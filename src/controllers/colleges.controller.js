const { validationResult } = require('express-validator');
const College = require('../models/college.model');
const User = require('../models/user.model');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

const getAllColleges = async (req, res, next) => {
  try {
    const colleges = await College.find();
    res.json({ success: true, data: colleges });
  } catch (error) {
    next(error);
  }
};

const getCollegeById = async (req, res, next) => {
  try {
    const college = await College.findById(req.params.id);
    if (!college) {
      return res
        .status(404)
        .json({ success: false, message: 'College not found' });
    }
    res.json({ success: true, data: college });
  } catch (error) {
    next(error);
  }
};

const createCollege = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const college = await College.create(req.body);

    // Update the user who created the college
    if (req.user && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, { college: college._id });
    }

    res.status(201).json({ success: true, data: college });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'College code already exists' });
    } else {
      next(error);
    }
  }
};

const updateCollege = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const college = await College.findById(req.params.id);
    if (!college) {
      return res
        .status(404)
        .json({ success: false, message: 'College not found' });
    }

    const {
      name,
      code,
      address,
      city,
      state,
      pincode,
      phone,
      email,
      website,
      establishedYear
    } = req.body;

    if (name) college.name = name;
    if (code) college.code = code;
    if (address) college.address = address;
    if (city) college.city = city;
    if (state) college.state = state;
    if (pincode) college.pincode = pincode;
    if (phone) college.phone = phone;
    if (email) college.email = email;
    if (website !== undefined) college.website = website;
    if (establishedYear) college.establishedYear = establishedYear;

    await college.save();
    res.json({ success: true, data: college });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'College code already exists' });
    } else {
      next(error);
    }
  }
};

const deleteCollege = async (req, res, next) => {
  try {
    const college = await College.findByIdAndDelete(req.params.id);
    if (!college) {
      return res
        .status(404)
        .json({ success: false, message: 'College not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllColleges,
  getCollegeById,
  createCollege,
  updateCollege,
  deleteCollege
};

