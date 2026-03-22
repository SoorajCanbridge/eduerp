const mongoose = require('mongoose');

const paymentStatuses = ['pending', 'completed', 'failed', 'cancelled', 'refunded'];
/** Methods allowed on each line when payment is split across multiple methods */
const paymentMethodSplitValues = ['cash', 'bank-transfer', 'upi', 'cheque', 'card', 'other'];
/** Top-level payment method; includes `mixed` when amountSplits use more than one method */
const paymentMethods = [...paymentMethodSplitValues, 'mixed'];

const amountSplitSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    paymentMethod: {
      type: String,
      enum: paymentMethodSplitValues,
      required: true
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
    notes: {
      type: String,
      trim: true
    },
    /** When set, this split is credited to this account; otherwise the payment-level `account` is used */
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account'
    }
  },
  { _id: true }
);

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
      required: function requiredPaymentMethod() {
        return !this.amountSplits || this.amountSplits.length === 0;
      },
      default: 'cash'
    },
    /** Optional breakdown when the total is paid using multiple methods or references */
    amountSplits: {
      type: [amountSplitSchema],
      default: undefined
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

const SPLIT_SUM_EPS = 0.01;

paymentSchema.pre('validate', function syncPaymentMethodFromSplits(next) {
  const splits = this.amountSplits;
  if (splits && splits.length > 0) {
    const sum = splits.reduce((s, row) => s + (Number(row.amount) || 0), 0);
    if (Math.abs(sum - Number(this.amount)) > SPLIT_SUM_EPS) {
      this.invalidate('amountSplits', 'Sum of amount splits must equal payment amount');
      return next();
    }
    const methods = splits.map((row) => row.paymentMethod).filter(Boolean);
    if (methods.length !== splits.length) {
      this.invalidate('amountSplits', 'Each amount split must have a paymentMethod');
      return next();
    }
    const unique = [...new Set(methods)];
    if (unique.length > 1) {
      this.paymentMethod = 'mixed';
    } else if (unique.length === 1) {
      this.paymentMethod = unique[0];
    }
  }
 
});

// Pre-save hook: auto-generate payment number (per college)
paymentSchema.pre('save', async function generatePaymentNumber(next) {
  try {
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
 
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Payment', paymentSchema);
