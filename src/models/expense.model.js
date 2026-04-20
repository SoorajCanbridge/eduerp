const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    // Per-college serial number (auto-incremented).
    // Example: for each `college`, expenses will be numbered 1,2,3... independently.
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
    recurringExpense: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecurringExpense'
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
    isCancelled: {
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

expenseSchema.index({ college: 1, date: 1 });
expenseSchema.index({ category: 1, date: 1 });
expenseSchema.index({ account: 1, date: 1 });
expenseSchema.index({ recurringExpense: 1, date: -1 });
// Prevent accidental duplicates when multiple records are created concurrently.
// Only enforce uniqueness for docs where `serialNumber` is a number.
expenseSchema.index(
  { college: 1, serialNumber: 1 },
  { unique: true, partialFilterExpression: { serialNumber: { $type: 'number' } } }
);
expenseSchema.index({ college: 1, serialNumber: -1 });

const createExpenseLedger = async ({ doc, account, createdBy, updatedBy }) => {
  const Ledger = mongoose.model('Ledger');

  const ledger = await Ledger.create({
    entryDate: doc.date,
    entryType: 'expense',
    lines: [{
      account: account._id,
      transactionType: 'debit',
      amount: doc.amount,
      balanceAfter: account.balance
    }],
    description: `Expense: ${doc.title}`,
    reference: doc.referenceNumber || doc._id.toString(),
    referenceId: doc._id,
    referenceModel: 'Expense',
    category: doc.category,
    college: doc.college,
    notes: doc.notes,
    createdBy,
    updatedBy
  });

  if (!account.ledgers) account.ledgers = [];
  if (!account.ledgers.some((id) => id.toString() === ledger._id.toString())) {
    account.ledgers.push(ledger._id);
    await account.save();
  }

  return ledger;
};

const deleteExpenseLedger = async ({ expenseId, account }) => {
  const Ledger = mongoose.model('Ledger');
  const ledger = await Ledger.findOneAndDelete({
    referenceId: expenseId,
    referenceModel: 'Expense'
  });

  if (ledger && account?.ledgers?.length) {
    account.ledgers = account.ledgers.filter((id) => id.toString() !== ledger._id.toString());
    await account.save();
  }
};

// Store original values for update operations
expenseSchema.pre('save', async function (next) {
  if (this.isNew) {
    // Auto-fill serial number for new expenses (per college).
    if (this.serialNumber == null) {
      if (!this.college) {
        // Fallback: if college isn't set, default to 1.
        // (Normal flow should always set `college` via controller/user context.)
        this.serialNumber = 1;
      } else {
        const lastExpense = await this.constructor
          .findOne({ college: this.college })
          .sort({ serialNumber: -1 })
          .select('serialNumber');

        this.serialNumber = (lastExpense?.serialNumber || 0) + 1;
      }
    }

    // New expense - will be handled in post save
    return null;
  }

  // Update operation - check if amount, account, or isCancelled changed
  if (this.isModified('amount') || this.isModified('account') || this.isModified('isCancelled')) {
    const Expense = this.constructor;
    const originalExpense = await Expense.findById(this._id);
    
    if (originalExpense) {
      // Store original values for post-save hook
      this._originalAmount = originalExpense.amount;
      this._originalAccount = originalExpense.account;
      this._originalIsCancelled = originalExpense.isCancelled;
    }
  }
  
  //next();
});

// Handle account balance updates and ledger entries
expenseSchema.post('save', async function (doc, next) {
  try {
    const Account = mongoose.model('Account');
    const Ledger = mongoose.model('Ledger');
    
    if (this.isNew) {
      // New expense
      if (doc.isCancelled) {
        // If new expense is created as cancelled, don't update account
        return //next();
      }

      // New active expense - debit the account (decrease balance)
      const account = await Account.findById(doc.account);
      if (!account) {
        return next(new Error('Account not found'));
      }

      // Decrease account balance (expense is a debit)
      account.balance -= doc.amount;
      account.updatedBy = doc.createdBy;
      await account.save();

      await createExpenseLedger({
        doc,
        account,
        createdBy: doc.createdBy,
        updatedBy: doc.updatedBy
      });
    } else {
      // Update operation
      const oldAmount = this._originalAmount;
      const oldAccount = this._originalAccount;
      const oldIsCancelled = this._originalIsCancelled;

      // Handle cancellation status changes
      if (oldIsCancelled !== doc.isCancelled) {
        if (doc.isCancelled) {
          // Expense was just cancelled - revert the transaction
          const account = await Account.findById(doc.account);
          if (account && !oldIsCancelled) {
            // Revert: add back the amount
            account.balance += doc.amount;
            account.updatedBy = doc.updatedBy || doc.createdBy;
            await account.save();
            
            await deleteExpenseLedger({ expenseId: doc._id, account });
          }
        } else {
          // Expense was uncancelled - apply the transaction
          const account = await Account.findById(doc.account);
          if (account) {
            account.balance -= doc.amount;
            account.updatedBy = doc.updatedBy || doc.createdBy;
            await account.save();
            
            await createExpenseLedger({
              doc,
              account,
              createdBy: doc.createdBy,
              updatedBy: doc.updatedBy
            });
          }
        }
        return //next();
      }

      // If expense is cancelled, don't process further
      if (doc.isCancelled) {
        return //next();
      }

      // If amount or account changed, update balances
      if (oldAmount !== undefined && (oldAmount !== doc.amount || oldAccount?.toString() !== doc.account?.toString())) {
        // Revert old transaction
        if (oldAccount && !oldIsCancelled) {
          const oldAccountDoc = await Account.findById(oldAccount);
          if (oldAccountDoc) {
            // Revert: add back the old amount
            oldAccountDoc.balance += oldAmount;
            oldAccountDoc.updatedBy = doc.updatedBy || doc.createdBy;
            await oldAccountDoc.save();
          }

          await deleteExpenseLedger({ expenseId: doc._id, account: oldAccountDoc });
        }

        // Apply new transaction
        const account = await Account.findById(doc.account);
        if (account) {
          account.balance -= doc.amount;
          account.updatedBy = doc.updatedBy || doc.createdBy;
          await account.save();

          await createExpenseLedger({
            doc,
            account,
            createdBy: doc.createdBy,
            updatedBy: doc.updatedBy
          });
        }
      } else if (this.isModified('date') || this.isModified('title') || this.isModified('category')) {
        // Update ledger entry metadata if only non-amount fields changed
        const ledger = await Ledger.findOne({
          referenceId: doc._id,
          referenceModel: 'Expense'
        });
        if (ledger) {
          ledger.entryDate = doc.date;
          ledger.description = `Expense: ${doc.title}`;
          ledger.category = doc.category;
          ledger.notes = doc.notes;
          ledger.updatedBy = doc.updatedBy || doc.createdBy;
          await ledger.save();
        } else {
          const account = await Account.findById(doc.account);
          if (account) {
            await createExpenseLedger({
              doc,
              account,
              createdBy: doc.createdBy,
              updatedBy: doc.updatedBy
            });
          }
        }
      }
    }
    
    //next();
  } catch (error) {
    next(error);
  }
});

// Handle account balance reversion on delete
expenseSchema.post('findOneAndDelete', async function (doc, next) {
  try {
    if (doc && !doc.isCancelled) {
      const Account = mongoose.model('Account');
      
      // Revert account balance (add back the amount)
      const account = await Account.findById(doc.account);
      if (account) {
        account.balance += doc.amount;
        account.updatedBy = doc.updatedBy || doc.createdBy;
        await account.save();
      }

      await deleteExpenseLedger({ expenseId: doc._id, account });
    }
    
    //next();
  } catch (error) {
    next(error);
  }
});

expenseSchema.post('deleteOne', async function (doc, next) {
  try {
    if (doc && !doc.isCancelled) {
      const Account = mongoose.model('Account');
      
      // Revert account balance (add back the amount)
      const account = await Account.findById(doc.account);
      if (account) {
        account.balance += doc.amount;
        account.updatedBy = doc.updatedBy || doc.createdBy;
        await account.save();
      }

      await deleteExpenseLedger({ expenseId: doc._id, account });
    }
    
    //next();
  } catch (error) {
    next(error);
  }
});

// Handle remove() method
expenseSchema.pre('remove', async function (next) {
  try {
    if (!this.isCancelled) {
      const Account = mongoose.model('Account');
      
      // Revert account balance (add back the amount)
      const account = await Account.findById(this.account);
      if (account) {
        account.balance += this.amount;
        account.updatedBy = this.updatedBy || this.createdBy;
        await account.save();
      }

      await deleteExpenseLedger({ expenseId: this._id, account });
    }
    
    //next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Expense', expenseSchema);


