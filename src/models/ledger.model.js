const mongoose = require('mongoose');

const transactionTypes = ['debit', 'credit'];
const entryTypes = ['income', 'expense', 'transfer', 'payment', 'invoice', 'adjustment', 'opening'];

const ledgerLineSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true
    },
    transactionType: {
      type: String,
      enum: transactionTypes,
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    balanceAfter: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);

const ledgerSchema = new mongoose.Schema(
  {
    entryDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    entryType: {
      type: String,
      enum: entryTypes,
      required: true
    },
    lines: {
      type: [ledgerLineSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: 'At least one line (account + transactionType + amount) is required'
      }
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    reference: {
      type: String,
      trim: true
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'referenceModel'
    },
    referenceModel: {
      type: String,
      enum: ['Income', 'Expense', 'Payment', 'Invoice', 'Account']
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinanceCategory'
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student'
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College'
    },
    notes: {
      type: String,
      trim: true
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

ledgerSchema.index({ college: 1, entryDate: 1 });
ledgerSchema.index({ college: 1, entryType: 1 });
ledgerSchema.index({ 'lines.account': 1, entryDate: 1 });
ledgerSchema.index({ 'lines.account': 1, entryDate: -1 });
ledgerSchema.index({ entryType: 1 });
ledgerSchema.index({ referenceId: 1, referenceModel: 1 });

/**
 * Apply this ledger's lines to account balances and add this ledger to each account's ledgers array.
 * Call after creating a new Ledger.
 */
ledgerSchema.statics.applyToAccounts = async function (ledgerDoc) {
  const Account = mongoose.model('Account');
  for (const line of ledgerDoc.lines) {
    const account = await Account.findById(line.account);
    if (!account) continue;
    account.balance = line.balanceAfter;
    if (!account.ledgers) account.ledgers = [];
    if (!account.ledgers.some((id) => id.toString() === ledgerDoc._id.toString())) {
      account.ledgers.push(ledgerDoc._id);
    }
    await account.save();
  }
};

/**
 * Revert this ledger's lines from account balances and remove this ledger from each account's ledgers array.
 * Call before update/delete.
 */
ledgerSchema.statics.revertFromAccounts = async function (ledgerDoc) {
  const Account = mongoose.model('Account');
  for (const line of ledgerDoc.lines) {
    const account = await Account.findById(line.account);
    if (!account) continue;
    if (line.transactionType === 'credit') {
      account.balance -= line.amount;
    } else {
      account.balance += line.amount;
    }
    if (account.ledgers && account.ledgers.length) {
      account.ledgers = account.ledgers.filter(
        (id) => id.toString() !== ledgerDoc._id.toString()
      );
    }
    await account.save();
  }
};

module.exports = mongoose.model('Ledger', ledgerSchema);
