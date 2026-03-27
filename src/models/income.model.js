const mongoose = require('mongoose');

const incomeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    // Per-college serial number (auto-incremented).
    // Example: for each `college`, incomes will be numbered 1,2,3... independently.
    serialNumber: {
      type: Number,
      default: undefined
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinanceCategory',
      required: true
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student'
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College'
    },
    referenceNumber: {
      type: String,
      trim: true
    },
    recipient: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      address: { type: String, trim: true }
    },
    notes: {
      type: String,
      trim: true
    },
    files: {
      type: [{ type: String, trim: true }],
      default: []
    },
    isCancelled: {
      type: Boolean,
      default: false
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
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

incomeSchema.index({ college: 1, date: 1 });
incomeSchema.index({ category: 1, date: 1 });
incomeSchema.index({ account: 1, date: 1 });
// Prevent accidental duplicates when multiple records are created concurrently.
// Only enforce uniqueness for docs where `serialNumber` is a number.
incomeSchema.index(
  { college: 1, serialNumber: 1 },
  { unique: true, partialFilterExpression: { serialNumber: { $type: 'number' } } }
);
incomeSchema.index({ college: 1, serialNumber: -1 });
incomeSchema.index({ payment: 1 }, { sparse: true });

// Store original values for update operations
incomeSchema.pre('save', async function (next) {
  if (this.isNew) {
    // Auto-fill serial number for new incomes (per college).
    if (this.serialNumber == null) {
      if (!this.college) {
        // Fallback: if college isn't set, default to 1.
        // (Normal flow should always set `college` via controller/user context.)
        this.serialNumber = 1;
      } else {
        const lastIncome = await this.constructor
          .findOne({ college: this.college })
          .sort({ serialNumber: -1 })
          .select('serialNumber');

        this.serialNumber = (lastIncome?.serialNumber || 0) + 1;
      }
    }

    // New income - will be handled in post save
    return null;
  }

  // Update operation - check if amount, account, or isCancelled changed
  if (this.isModified('amount') || this.isModified('account') || this.isModified('isCancelled')) {
    const Income = this.constructor;
    const originalIncome = await Income.findById(this._id);
    
    if (originalIncome) {
      // Store original values for post-save hook
      this._originalAmount = originalIncome.amount;
      this._originalAccount = originalIncome.account;
      this._originalIsCancelled = originalIncome.isCancelled;
    }
  }
  
  ////next();
});

// Handle account balance updates and ledger entries
incomeSchema.post('save', async function (doc, next) {
  try {
    const Account = mongoose.model('Account');
    const Ledger = mongoose.model('Ledger');
    
    if (this.isNew) {
      // New income
      if (doc.isCancelled) {
        // If new income is created as cancelled, don't update account
        return //next();
      }
      // Income linked to a payment: account and ledger already updated by payment flow
      if (doc.payment) {
        return //next();
      }

      // New active income - credit the account (increase balance)
      const account = await Account.findById(doc.account);
      if (!account) {
        return next(new Error('Account not found'));
      }

      // Increase account balance (income is a credit)
      account.balance += doc.amount;
      account.updatedBy = doc.createdBy;
      await account.save();

      // Create ledger entry
      await Ledger.create({
        entryDate: doc.date,
        entryType: 'income',
        lines: [{
          account: account._id,
          transactionType: 'credit',
          amount: doc.amount,
          balanceAfter: account.balance
        }],
        description: `Income: ${doc.title}`,
        reference: doc.referenceNumber || doc._id.toString(),
        referenceId: doc._id,
        referenceModel: 'Income',
        category: doc.category,
        student: doc.student,
        college: doc.college,
        notes: doc.notes,
        createdBy: doc.createdBy
      });
    } else {
      // Update operation
      // Income linked to payment: account/ledger are managed by payment flow
      if (doc.payment) {
        return //next();
      }

      const oldAmount = this._originalAmount;
      const oldAccount = this._originalAccount;
      const oldIsCancelled = this._originalIsCancelled;

      // Handle cancellation status changes
      if (oldIsCancelled !== doc.isCancelled) {
        if (doc.isCancelled) {
          // Income was just cancelled - revert the transaction
          const account = await Account.findById(doc.account);
          if (account && !oldIsCancelled) {
            // Revert: subtract the amount
            account.balance -= doc.amount;
            account.updatedBy = doc.updatedBy || doc.createdBy;
            await account.save();
            
            // Delete ledger entry
            await Ledger.findOneAndDelete({
              referenceId: doc._id,
              referenceModel: 'Income'
            });
          }
        } else {
          // Income was uncancelled - apply the transaction
          const account = await Account.findById(doc.account);
          if (account) {
            account.balance += doc.amount;
            account.updatedBy = doc.updatedBy || doc.createdBy;
            await account.save();
            
            // Create ledger entry
            await Ledger.create({
              entryDate: doc.date,
              entryType: 'income',
              lines: [{
                account: account._id,
                transactionType: 'credit',
                amount: doc.amount,
                balanceAfter: account.balance
              }],
              description: `Income: ${doc.title}`,
              reference: doc.referenceNumber || doc._id.toString(),
              referenceId: doc._id,
              referenceModel: 'Income',
              category: doc.category,
              student: doc.student,
              college: doc.college,
              notes: doc.notes,
              createdBy: doc.createdBy,
              updatedBy: doc.updatedBy
            });
          }
        }
        return //next();
      }

      // If income is cancelled, don't process further
      if (doc.isCancelled) {
        return //next();
      }

      // If amount or account changed, update balances
      if (oldAmount !== undefined && (oldAmount !== doc.amount || oldAccount?.toString() !== doc.account?.toString())) {
        // Revert old transaction
        if (oldAccount && !oldIsCancelled) {
          const oldAccountDoc = await Account.findById(oldAccount);
          if (oldAccountDoc) {
            // Revert: subtract the old amount
            oldAccountDoc.balance -= oldAmount;
            oldAccountDoc.updatedBy = doc.updatedBy || doc.createdBy;
            await oldAccountDoc.save();
          }

          // Delete old ledger entry
          await Ledger.findOneAndDelete({
            referenceId: doc._id,
            referenceModel: 'Income'
          });
        }

        // Apply new transaction
        const account = await Account.findById(doc.account);
        if (account) {
          account.balance += doc.amount;
          account.updatedBy = doc.updatedBy || doc.createdBy;
          await account.save();

          // Create new ledger entry
          await Ledger.create({
            entryDate: doc.date,
            entryType: 'income',
            lines: [{
              account: account._id,
              transactionType: 'credit',
              amount: doc.amount,
              balanceAfter: account.balance
            }],
            description: `Income: ${doc.title}`,
            reference: doc.referenceNumber || doc._id.toString(),
            referenceId: doc._id,
            referenceModel: 'Income',
            category: doc.category,
            student: doc.student,
            college: doc.college,
            notes: doc.notes,
            createdBy: doc.createdBy,
            updatedBy: doc.updatedBy
          });
        }
      } else if (this.isModified('date') || this.isModified('title') || this.isModified('category')) {
        // Update ledger entry metadata if only non-amount fields changed
        const ledger = await Ledger.findOne({
          referenceId: doc._id,
          referenceModel: 'Income'
        });
        if (ledger) {
          ledger.entryDate = doc.date;
          ledger.description = `Income: ${doc.title}`;
          ledger.category = doc.category;
          ledger.notes = doc.notes;
          ledger.updatedBy = doc.updatedBy || doc.createdBy;
          await ledger.save();
        }
      }
    }
    
    ////next();
  } catch (error) {
    next(error);
  }
});

// Handle account balance reversion on delete
incomeSchema.post('findOneAndDelete', async function (doc, next) {
  try {
    if (doc && !doc.isCancelled) {
      const Account = mongoose.model('Account');
      const Ledger = mongoose.model('Ledger');
      
      // Revert account balance (subtract the amount)
      const account = await Account.findById(doc.account);
      if (account) {
        account.balance -= doc.amount;
        account.updatedBy = doc.updatedBy || doc.createdBy;
        await account.save();
      }

      // Delete ledger entry
      await Ledger.findOneAndDelete({
        referenceId: doc._id,
        referenceModel: 'Income'
      });
    }
    
    ////next();
  } catch (error) {
    next(error);
  }
});

incomeSchema.post('deleteOne', async function (doc, next) {
  try {
    if (doc && !doc.isCancelled) {
      const Account = mongoose.model('Account');
      const Ledger = mongoose.model('Ledger');
      
      // Revert account balance (subtract the amount)
      const account = await Account.findById(doc.account);
      if (account) {
        account.balance -= doc.amount;
        account.updatedBy = doc.updatedBy || doc.createdBy;
        await account.save();
      }

      // Delete ledger entry
      await Ledger.findOneAndDelete({
        referenceId: doc._id,
        referenceModel: 'Income'
      });
    }
    
    ////next();
  } catch (error) {
    next(error);
  }
});

// Handle remove() method
incomeSchema.pre('remove', async function (next) {
  try {
    if (!this.isCancelled) {
      const Account = mongoose.model('Account');
      const Ledger = mongoose.model('Ledger');
      
      // Revert account balance (subtract the amount)
      const account = await Account.findById(this.account);
      if (account) {
        account.balance -= this.amount;
        account.updatedBy = this.updatedBy || this.createdBy;
        await account.save();
      }

      // Delete ledger entry
      await Ledger.findOneAndDelete({
        referenceId: this._id,
        referenceModel: 'Income'
      });
    }
    
    ////next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Income', incomeSchema);


