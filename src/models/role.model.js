const mongoose = require('mongoose');

const PERMISSION_ACTIONS = ['view', 'edit', 'none'];

const permissionSchema = new mongoose.Schema(
  {
    resource: {
      type: String,
      required: true,
      trim: true
    },
    action: {
      type: String,
      enum: PERMISSION_ACTIONS,
      default: 'none'
    }
  },
  { _id: false }
);

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    permissions: {
      type: [permissionSchema],
      default: []
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      default: null
    }
  },
  { timestamps: true }
);

roleSchema.index({ name: 1, college: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);
module.exports.PERMISSION_ACTIONS = PERMISSION_ACTIONS;

