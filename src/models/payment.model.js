const mongoose = require('mongoose');

const paymentStatuses = ['pending', 'completed', 'failed', 'cancelled', 'refunded'];
const paymentMethods = ['cash', 'bank-transfer', 'upi', 'cheque', 'card', 'other'];

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      trim: true,
      uppercase: true
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    paymentMethod: {
      type: String,
      enum: paymentMethods,
      required: true,
      default: 'cash'
    },
    status: {
      type: String,
      enum: paymentStatuses,
      default: 'pending'
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice'
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student'
    },
    referenceNumber: {
      type: String,
      trim: true
    },
    transactionId: {
      type: String,
      trim: true
    },
    chequeNumber: {
      type: String,
      trim: true
    },
    chequeDate: {
      type: Date
    },
    bankName: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
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

paymentSchema.index({ college: 1, paymentNumber: 1 }, { unique: true });
paymentSchema.index({ college: 1, paymentDate: 1 });
paymentSchema.index({ invoice: 1 });
paymentSchema.index({ student: 1 });
paymentSchema.index({ account: 1 });
paymentSchema.index({ status: 1 });

// Pre-save hook: auto-generate payment number (per college)
paymentSchema.pre('save', async function(next) {
  try {
    // Auto-generate payment number for new payments when not provided
    if (this.isNew && !this.paymentNumber && this.college) {
      const lastPayment = await this.constructor
        .findOne({ college: this.college })
        .sort({ createdAt: -1 })
        .select('paymentNumber')
        .lean();
      const match = lastPayment?.paymentNumber?.match(/(\d+)$/);
      const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
      this.paymentNumber = `PAY-${String(nextNum).padStart(5, '0')}`;
    }
    // next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Payment', paymentSchema);

