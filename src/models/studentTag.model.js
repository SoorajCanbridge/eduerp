const mongoose = require('mongoose');

const studentTagSchema = new mongoose.Schema(
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
    color: {
      type: String,
      trim: true
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

studentTagSchema.index({ college: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('StudentTag', studentTagSchema);
