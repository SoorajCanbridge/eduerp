const { validationResult } = require('express-validator');
const College = require('../models/college.model');
const User = require('../models/user.model');
const { uploadToS3, deleteFromS3, generateFileName } = require('../utils/upload');
const logger = require('../utils/logger');

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
    const college = await College.findById(req.params.id);
    if (!college) {
      return res
        .status(404)
        .json({ success: false, message: 'College not found' });
    }

    // Delete logo from S3 if it exists (logo is stored as folder/filename)
    if (college.logo) {
      try {
        await deleteFromS3(college.logo);
      } catch (error) {
        logger.error('Failed to delete college logo from S3', { error: error.message });
        // Continue with college deletion even if logo deletion fails
      }
    }

    await College.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const uploadLogo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided'
      });
    }

    // Validate file type (should be an image)
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'File must be an image'
      });
    }

    const college = await College.findById(req.params.id);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }

    // Delete old logo from S3 if it exists (logo is stored as folder/filename)
    if (college.logo) {
      try {
        await deleteFromS3(college.logo);
      } catch (error) {
        logger.error('Failed to delete old logo from S3', { error: error.message });
        // Continue with new logo upload even if old logo deletion fails
      }
    }

    // Upload new logo to S3; store path as folder/filename (e.g. logo/filename.jpg)
    const folder = 'logo';
    const fileName = generateFileName(req.file.originalname, folder);
    const storedPath = await uploadToS3(
      req.file.buffer,
      fileName,
      req.file.mimetype
    );

    college.logo = storedPath;
    await college.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const apiPrefix = require('../config/env').apiPrefix;
    const logoUrl = `${baseUrl}${apiPrefix}/image/${storedPath}`;

    res.status(200).json({
      success: true,
      message: 'Logo uploaded successfully',
      data: {
        college: college,
        logoPath: storedPath,
        logoUrl: logoUrl
      }
    });
  } catch (error) {
    logger.error('Upload logo error', { error: error.message });
    next(error);
  }
};

module.exports = {
  getAllColleges,
  getCollegeById,
  createCollege,
  updateCollege,
  deleteCollege,
  uploadLogo
};

