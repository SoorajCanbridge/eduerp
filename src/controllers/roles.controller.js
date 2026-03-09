const { validationResult } = require('express-validator');
const Role = require('../models/role.model');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

const getAllRoles = async (req, res, next) => {
  try {
    const rawCollege = req.query.college || (req.user && req.user.college);
    const collegeId = rawCollege && (rawCollege._id ?? rawCollege) || null;
    const filter = {
      $or: [{ college: null }]
    };
    if (collegeId) {
      filter.$or.push({ college: collegeId });
    }
    const roles = await Role.find(filter).populate('college', 'name code').lean();
    res.json({ success: true, data: roles });
  } catch (error) {
    next(error);
  }
};

const getRoleById = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id).populate('college', 'name code').lean();
    if (!role) {
      return res
        .status(404)
        .json({ success: false, message: 'Role not found' });
    }
    res.json({ success: true, data: role });
  } catch (error) {
    next(error);
  }
};

const createRole = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const { name, description, permissions } = req.body;
    const collegeId = req.user && (req.user.college?._id ?? req.user.college) || null;
    const existing = await Role.findOne({ name, college: collegeId });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: 'Role with this name already exists for this college' });
    }

    const role = await Role.create({ name, description, permissions, college: collegeId });
    const data = await Role.findById(role._id).populate('college', 'name code').lean();
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const updateRole = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res
        .status(404)
        .json({ success: false, message: 'Role not found' });
    }

    if (req.body.name && req.body.name !== role.name) {
      const existing = await Role.findOne({ name: req.body.name, college: role.college });
      if (existing) {
        return res
          .status(409)
          .json({ success: false, message: 'Role name already exists for this college' });
      }
      role.name = req.body.name;
    }

    if (req.body.description !== undefined) {
      role.description = req.body.description;
    }

    if (req.body.permissions !== undefined) {
      role.permissions = Array.isArray(req.body.permissions)
        ? req.body.permissions
        : [];
    }

    if (req.body.college !== undefined) {
      role.college = req.body.college || null;
    }

    await role.save();
    const data = await Role.findById(role._id).populate('college', 'name code').lean();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findByIdAndDelete(req.params.id);
    if (!role) {
      return res
        .status(404)
        .json({ success: false, message: 'Role not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole
};

