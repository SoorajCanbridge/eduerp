const mongoose = require('mongoose');

const financeCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['income', 'expense', 'both'],
      required: true,
      default: 'both'
    },
    description: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College'
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

financeCategorySchema.index({ college: 1, name: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('FinanceCategory', financeCategorySchema);


