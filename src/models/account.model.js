const mongoose = require('mongoose');

const accountTypes = [
  'bank',
  'cash',
  'credit-card',
  'savings',
  'current',
  'fixed-deposit',
  'loan',
  'overdraft',
  'wallet',
  'investment',
  'petty-cash',
  'other'
];
const accountStatuses = [
  'active',
  'inactive',
  'closed',
  'frozen',
  'suspended',
  'pending',
  'archived'
];

const accountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    accountNumber: {
      type: String,
      trim: true
    },
    accountType: {
      type: String,
      enum: accountTypes,
      required: true,
      default: 'bank'
    },
    bankName: {
      type: String,
      trim: true
    },
    branch: {
      type: String,
      trim: true
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true
    },
    balance: {
      type: Number,
      default: 0,
      required: true
    },
    openingBalance: {
      type: Number,
      default: 0
    },
    openingBalanceDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: accountStatuses,
      default: 'active'
    },
    description: {
      type: String,
      trim: true
    },
    contactPerson: {
      name: {
        type: String,
        trim: true
      },
      phone: {
        type: String,
        trim: true
      },
      email: {
        type: String,
        trim: true,
        lowercase: true
      }
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College'
    },
    openingBalanceLedger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ledger'
    },
    ledgers: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ledger' }],
      default: []
    },
    isDefault: {
      type: Boolean,
      default: false
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

accountSchema.index({ college: 1, name: 1 }, { unique: true });
accountSchema.index({ college: 1, status: 1 });
accountSchema.index({ accountType: 1 });
accountSchema.index({ openingBalanceLedger: 1 });

/**
 * Get ledger entries linked to this account (ledgers that have a line for this account).
 * @param {Object} [opts] - { limit, skip, sort }
 * @returns {Promise<Query>} Mongoose query for Ledger documents
 */
accountSchema.methods.getLedgerQuery = function (opts = {}) {
  const Ledger = mongoose.model('Ledger');
  let q = Ledger.find({ 'lines.account': this._id })
    .sort(opts.sort || { entryDate: -1 });
  if (opts.skip != null) q = q.skip(opts.skip);
  if (opts.limit != null) q = q.limit(opts.limit);
  return q;
};

module.exports = mongoose.model('Account', accountSchema);

