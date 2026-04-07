const mongoose = require('mongoose');

const recurringFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];

const recurringExpenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinanceCategory',
      required: true
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account'
    },
    vendor: {
      type: String,
      trim: true
    },
    recipient: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      address: { type: String, trim: true }
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College'
    },
    referenceNumber: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    },
    files: {
      type: [{ type: String, trim: true }],
      default: []
    },
    frequency: {
      type: String,
      enum: recurringFrequencies,
      required: true
    },
    interval: {
      type: Number,
      default: 1,
      min: 1
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date
    },
    nextDueDate: {
      type: Date,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastPaymentBy: {
      type: String,
      trim: true
    },
    lastPaymentDate: {
      type: Date
    },
    lastPaymentStatus: {
      type: String,
      trim: true
    },
    paymentCount: {
      type: Number,
      default: 0,
      min: 0
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

recurringExpenseSchema.index({ college: 1, isActive: 1 });
recurringExpenseSchema.index({ college: 1, nextDueDate: 1 });

module.exports = mongoose.model('RecurringExpense', recurringExpenseSchema);
module.exports.recurringFrequencies = recurringFrequencies;
