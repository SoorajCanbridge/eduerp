const { validationResult } = require('express-validator');
const Income = require('../models/income.model');
const Expense = require('../models/expense.model');
const FinanceCategory = require('../models/financeCategory.model');
const Invoice = require('../models/invoice.model');
const SavedInvoiceContent = require('../models/savedInvoiceContent.model');
const Account = require('../models/account.model');
const Ledger = require('../models/ledger.model');
const Payment = require('../models/payment.model');

const PAYMENT_SPLIT_AMOUNT_EPS = 0.02;

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

/** Accept `account`, `accountId`, or populated `{ _id }`; fall back to payment-level account. */
const resolveSplitAccountId = (splitRow, paymentAccountId) => {
  const ref = splitRow.account ?? splitRow.accountId;
  const fallback =
    paymentAccountId && typeof paymentAccountId === 'object' && paymentAccountId._id != null
      ? paymentAccountId._id
      : paymentAccountId;
  if (ref == null || ref === '') {
    return fallback;
  }
  if (typeof ref === 'object' && ref._id != null) {
    return ref._id;
  }
  return ref;
};

/** Prefer `amountSplits`; also accepts `accountSplits` (same shape: account + amount). */
const getPaymentSplitsRowsFromBody = (body) => {
  if (body.amountSplits && Array.isArray(body.amountSplits) && body.amountSplits.length > 0) {
    return body.amountSplits;
  }
  if (body.accountSplits && Array.isArray(body.accountSplits) && body.accountSplits.length > 0) {
    return body.accountSplits;
  }
  return null;
};

/** Normalize split rows from request body; returns `undefined` if no non-empty split array. */
const normalizeAmountSplitsFromBody = (body) => {
  const rows = getPaymentSplitsRowsFromBody(body);
  if (!rows) {
    return undefined;
  }
  const defaultPm = body.paymentMethod || 'cash';
  return rows.map((row) => {
    const split = {
      amount: Number(row.amount),
      paymentMethod: row.paymentMethod || defaultPm
    };
    if (row.referenceNumber != null && row.referenceNumber !== '') {
      split.referenceNumber = String(row.referenceNumber).trim();
    }
    if (row.transactionId != null && row.transactionId !== '') {
      split.transactionId = String(row.transactionId).trim();
    }
    if (row.chequeNumber != null && row.chequeNumber !== '') {
      split.chequeNumber = String(row.chequeNumber).trim();
    }
    if (row.chequeDate) {
      split.chequeDate = new Date(row.chequeDate);
    }
    if (row.bankName != null && row.bankName !== '') {
      split.bankName = String(row.bankName).trim();
    }
    if (row.notes != null && row.notes !== '') {
      split.notes = String(row.notes).trim();
    }
    const accRef = row.account ?? row.accountId;
    if (accRef != null && accRef !== '') {
      split.account = typeof accRef === 'object' && accRef._id != null ? accRef._id : accRef;
    }
    return split;
  });
};

/**
 * Resolve ledger credit lines for a payment: one line per split (or one line for the full amount).
 * Each split credits its own account when set (`account` / `accountId`), else the payment-level account.
 */
const buildPaymentLedgerCreditLines = async (payment) => {
  const doc = payment._id ? await Payment.findById(payment._id) : payment;
  if (!doc) {
    const err = new Error('Payment not found');
    err.statusCode = 404;
    throw err;
  }

  const collegeId = doc.college;
  const splits =
    doc.amountSplits && doc.amountSplits.length > 0
      ? doc.amountSplits.map((s) => {
          const plain = typeof s.toObject === 'function' ? s.toObject() : { ...s };
          const rawAmt = plain.amount;
          const amount = typeof rawAmt === 'object' && rawAmt != null && typeof rawAmt.toString === 'function'
            ? Number(rawAmt.toString())
            : Number(rawAmt);
          if (!Number.isFinite(amount) || amount < 0) {
            const err = new Error('Each amount split must have a valid non-negative amount');
            err.statusCode = 400;
            throw err;
          }
          const accountId = resolveSplitAccountId(plain, doc.account);
          if (accountId == null || accountId === '') {
            const err = new Error('Each amount split must resolve to an account (set split account/accountId or payment account)');
            err.statusCode = 400;
            throw err;
          }
          return { amount, accountId };
        })
      : [
          {
            amount:
              typeof doc.amount === 'object' && doc.amount != null && typeof doc.amount.toString === 'function'
                ? Number(doc.amount.toString())
                : Number(doc.amount),
            accountId: doc.account && typeof doc.account === 'object' && doc.account._id != null ? doc.account._id : doc.account
          }
        ];

  for (const row of splits) {
    if (row.accountId == null || row.accountId === '') {
      const err = new Error('Each payment split must resolve to an account');
      err.statusCode = 400;
      throw err;
    }
  }

  const splitSum = splits.reduce((sum, row) => sum + row.amount, 0);
  const total =
    typeof doc.amount === 'object' && doc.amount != null && typeof doc.amount.toString === 'function'
      ? Number(doc.amount.toString())
      : Number(doc.amount);
  if (!Number.isFinite(total) || total < 0) {
    const err = new Error('Payment amount is invalid');
    err.statusCode = 400;
    throw err;
  }
  if (Math.abs(splitSum - total) > PAYMENT_SPLIT_AMOUNT_EPS) {
    const err = new Error(
      `Split amounts (${splitSum.toFixed(2)}) must equal payment amount (${total.toFixed(2)})`
    );
    err.statusCode = 400;
    throw err;
  }

  const byAccount = new Map();
  const lines = [];

  for (const s of splits) {
    if (s.amount === 0) {
      continue;
    }
    const id = s.accountId.toString();
    let rec = byAccount.get(id);
    if (!rec) {
      const acc = await Account.findById(s.accountId);
      if (!acc) {
        const err = new Error('Account not found for payment');
        err.statusCode = 404;
        throw err;
      }
      if (collegeId && acc.college && acc.college.toString() !== collegeId.toString()) {
        const err = new Error('Each account must belong to the same college as the payment');
        err.statusCode = 400;
        throw err;
      }
      rec = { account: acc, running: acc.balance };
      byAccount.set(id, rec);
    }
    rec.running += s.amount;
    lines.push({
      account: rec.account._id,
      transactionType: 'credit',
      amount: s.amount,
      balanceAfter: rec.running
    });
  }

  if (lines.length < 1) {
    const err = new Error('No ledger lines could be generated for this payment');
    err.statusCode = 400;
    throw err;
  }

  return lines;
};

const collectPaymentAccountIds = (body) => {
  const ids = new Set();
  const primary = body.account;
  if (primary) ids.add(primary.toString());
  const splitRows = getPaymentSplitsRowsFromBody(body);
  if (splitRows) {
    for (const row of splitRows) {
      const ref = resolveSplitAccountId(row, primary);
      if (ref != null && ref !== '') ids.add(ref.toString());
    }
  }
  return [...ids];
};

const assertPaymentAccountsValid = async (body, collegeId) => {
  const ids = collectPaymentAccountIds(body);
  if (ids.length === 0) {
    const err = new Error('Account is required');
    err.statusCode = 400;
    throw err;
  }
  for (const id of ids) {
    const acc = await Account.findById(id);
    if (!acc) {
      const err = new Error('Account not found');
      err.statusCode = 404;
      throw err;
    }
    if (collegeId && acc.college && acc.college.toString() !== collegeId.toString()) {
      const err = new Error('Account does not belong to this college');
      err.statusCode = 400;
      throw err;
    }
  }
};

// Get or create the "Payments" income category for a college
const getOrCreatePaymentsCategory = async (collegeId, userId) => {
  let category = await FinanceCategory.findOne({
    college: collegeId,
    name: /^Payments$/i,
    $or: [{ type: 'income' }, { type: 'both' }]
  });
  if (!category) {
    category = await FinanceCategory.create({
      name: 'Payments',
      type: 'income',
      description: 'Income from payments',
      college: collegeId,
      createdBy: userId
    });
  }
  return category;
};

// CATEGORY CRUD
const getCategories = async (req, res, next) => {
  try {
    const filters = {};
    if (req.user.college) {
      filters.college = req.user.college;
    }
    if (req.query.type) {
      filters.type = req.query.type;
    }
    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
    }

    const categories = await FinanceCategory.find(filters)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ name: 1 });

    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

const getCategoryById = async (req, res, next) => {
  try {
    const category = await FinanceCategory.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

const createCategory = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const data = {
      ...req.body,
      college: req.body.college || req.user.college,
      createdBy: req.user._id
    };

    const category = await FinanceCategory.create(data);
    const populated = await FinanceCategory.findById(category._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Category with this name and type already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const updateCategory = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const category = await FinanceCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const updatableFields = ['name', 'type', 'description', 'isActive'];
    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        category[field] = req.body[field];
      }
    });

    category.updatedBy = req.user._id;
    await category.save();

    const updated = await FinanceCategory.findById(category._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Category with this name and type already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const category = await FinanceCategory.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// INCOME CRUD
const getIncomes = async (req, res, next) => {
  try {
    const filters = {};
    const query = req.query;

    if (req.user.college) {
      filters.college = req.user.college;
    }
    if (query.categoryId) {
      filters.category = query.categoryId;
    }
    if (query.accountId) {
      filters.account = query.accountId;
    }
    if (query.studentId) {
      filters.student = query.studentId;
    }
    if (query.isCancelled !== undefined) {
      filters.isCancelled = query.isCancelled === 'true';
    }
    if (query.startDate || query.endDate) {
      filters.date = {};
      if (query.startDate) {
        filters.date.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filters.date.$lte = new Date(query.endDate);
      }
    }

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy || 'date';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const incomes = await Income.find(filters)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('student', 'name studentId')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Income.countDocuments(filters);

    res.json({
      success: true,
      data: incomes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getIncomeById = async (req, res, next) => {
  try {
    const income = await Income.findById(req.params.id)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('student', 'name studentId')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!income) {
      return res.status(404).json({ success: false, message: 'Income record not found' });
    }

    res.json({ success: true, data: income });
  } catch (error) {
    next(error);
  }
};

const createIncome = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const category = await FinanceCategory.findById(req.body.category);
    if (!category || (category.type !== 'income' && category.type !== 'both')) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid category for income transaction' });
    }

    // Validate account exists
    const account = await Account.findById(req.body.account);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const data = {
      ...req.body,
      college: req.body.college || req.user.college,
      createdBy: req.user._id
    };
    if (Array.isArray(data.files)) {
      data.files = data.files.filter((p) => typeof p === 'string' && p.trim());
    } else {
      data.files = [];
    }
    if (req.body.recipient && typeof req.body.recipient === 'object') {
      data.recipient = {
        name: req.body.recipient.name != null ? String(req.body.recipient.name).trim() : undefined,
        phone: req.body.recipient.phone != null ? String(req.body.recipient.phone).trim() : undefined,
        email: req.body.recipient.email != null ? String(req.body.recipient.email).trim().toLowerCase() : undefined,
        address: req.body.recipient.address != null ? String(req.body.recipient.address).trim() : undefined
      };
    }

    const income = await Income.create(data);
    const populated = await Income.findById(income._id)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('student', 'name studentId')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

const updateIncome = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const income = await Income.findById(req.params.id);
    if (!income) {
      return res.status(404).json({ success: false, message: 'Income record not found' });
    }

    if (req.body.category) {
      const category = await FinanceCategory.findById(req.body.category);
      if (!category || (category.type !== 'income' && category.type !== 'both')) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid category for income transaction' });
      }
    }

    // Validate account if being updated
    if (req.body.account) {
      const account = await Account.findById(req.body.account);
      if (!account) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }
    }

    const updatableFields = [
      'title',
      'amount',
      'date',
      'category',
      'account',
      'student',
      'college',
      'referenceNumber',
      'recipient',
      'notes',
      'files',
      'isCancelled'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'files' && Array.isArray(req.body[field])) {
          income[field] = req.body[field].filter((p) => typeof p === 'string' && p.trim());
        } else if (field === 'recipient' && typeof req.body[field] === 'object' && req.body[field] !== null) {
          income[field] = {
            name: req.body[field].name != null ? String(req.body[field].name).trim() : undefined,
            phone: req.body[field].phone != null ? String(req.body[field].phone).trim() : undefined,
            email: req.body[field].email != null ? String(req.body[field].email).trim().toLowerCase() : undefined,
            address: req.body[field].address != null ? String(req.body[field].address).trim() : undefined
          };
        } else {
          income[field] = req.body[field];
        }
      }
    });

    income.updatedBy = req.user._id;
    await income.save();

    const updated = await Income.findById(income._id)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('student', 'name studentId')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const deleteIncome = async (req, res, next) => {
  try {
    const income = await Income.findByIdAndDelete(req.params.id);
    if (!income) {
      return res.status(404).json({ success: false, message: 'Income record not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// EXPENSE CRUD
const getExpenses = async (req, res, next) => {
  try {
    const filters = {};
    const query = req.query;

    if (req.user.college) {
      filters.college = req.user.college;
    }
    if (query.categoryId) {
      filters.category = query.categoryId;
    }
    if (query.accountId) {
      filters.account = query.accountId;
    }
    if (query.vendor) {
      filters.vendor = { $regex: query.vendor, $options: 'i' };
    }
    if (query.isCancelled !== undefined) {
      filters.isCancelled = query.isCancelled === 'true';
    }
    if (query.startDate || query.endDate) {
      filters.date = {};
      if (query.startDate) {
        filters.date.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filters.date.$lte = new Date(query.endDate);
      }
    }

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy || 'date';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const expenses = await Expense.find(filters)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Expense.countDocuments(filters);

    res.json({
      success: true,
      data: expenses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getExpenseById = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }

    res.json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

const createExpense = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const category = await FinanceCategory.findById(req.body.category);
    if (!category || (category.type !== 'expense' && category.type !== 'both')) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid category for expense transaction' });
    }

    // Validate account exists
    const account = await Account.findById(req.body.account);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const data = {
      ...req.body,
      college: req.body.college || req.user.college,
      createdBy: req.user._id
    };
    if (Array.isArray(data.files)) {
      data.files = data.files.filter((p) => typeof p === 'string' && p.trim());
    } else {
      data.files = [];
    }
    if (req.body.recipient && typeof req.body.recipient === 'object') {
      data.recipient = {
        name: req.body.recipient.name != null ? String(req.body.recipient.name).trim() : undefined,
        phone: req.body.recipient.phone != null ? String(req.body.recipient.phone).trim() : undefined,
        email: req.body.recipient.email != null ? String(req.body.recipient.email).trim().toLowerCase() : undefined,
        address: req.body.recipient.address != null ? String(req.body.recipient.address).trim() : undefined
      };
    }

    const expense = await Expense.create(data);
    const populated = await Expense.findById(expense._id)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

const updateExpense = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }

    if (req.body.category) {
      const category = await FinanceCategory.findById(req.body.category);
      if (!category || (category.type !== 'expense' && category.type !== 'both')) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid category for expense transaction' });
      }
    }

    // Validate account if being updated
    if (req.body.account) {
      const account = await Account.findById(req.body.account);
      if (!account) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }
    }

    const updatableFields = [
      'title',
      'amount',
      'date',
      'category',
      'account',
      'vendor',
      'college',
      'referenceNumber',
      'recipient',
      'notes',
      'files',
      'isCancelled'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'files' && Array.isArray(req.body[field])) {
          expense[field] = req.body[field].filter((p) => typeof p === 'string' && p.trim());
        } else if (field === 'recipient' && typeof req.body[field] === 'object' && req.body[field] !== null) {
          expense[field] = {
            name: req.body[field].name != null ? String(req.body[field].name).trim() : undefined,
            phone: req.body[field].phone != null ? String(req.body[field].phone).trim() : undefined,
            email: req.body[field].email != null ? String(req.body[field].email).trim().toLowerCase() : undefined,
            address: req.body[field].address != null ? String(req.body[field].address).trim() : undefined
          };
        } else {
          expense[field] = req.body[field];
        }
      }
    });

    expense.updatedBy = req.user._id;
    await expense.save();

    const updated = await Expense.findById(expense._id)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense record not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// SUMMARY
const getFinanceSummary = async (req, res, next) => {
  try {
    const query = req.query;
    const baseIncomeMatch = {};
    const baseExpenseMatch = {};

    if (req.user.college) {
      baseIncomeMatch.college = req.user.college;
      baseExpenseMatch.college = req.user.college;
    }

    if (query.startDate || query.endDate) {
      const dateFilter = {};
      if (query.startDate) {
        dateFilter.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        dateFilter.$lte = new Date(query.endDate);
      }
      baseIncomeMatch.date = dateFilter;
      baseExpenseMatch.date = dateFilter;
    }

    const [incomeAgg, expenseAgg, incomeByCategory, expenseByCategory] = await Promise.all([
      Income.aggregate([
        { $match: baseIncomeMatch },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { $match: baseExpenseMatch },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Income.aggregate([
        { $match: baseIncomeMatch },
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),
      Expense.aggregate([
        { $match: baseExpenseMatch },
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const totalIncome = incomeAgg[0]?.totalAmount || 0;
    const totalIncomeCount = incomeAgg[0]?.count || 0;
    const totalExpense = expenseAgg[0]?.totalAmount || 0;
    const totalExpenseCount = expenseAgg[0]?.count || 0;

    const categoryIds = [
      ...new Set([...incomeByCategory.map((i) => i._id?.toString()), ...expenseByCategory.map((e) => e._id?.toString())])
    ].filter(Boolean);

    const categories = await FinanceCategory.find({ _id: { $in: categoryIds } }).select(
      'name type'
    );
    const categoryMap = categories.reduce((acc, cat) => {
      acc[cat._id.toString()] = cat;
      return acc;
    }, {});

    const incomeByCatFormatted = incomeByCategory.map((item) => {
      const cat = categoryMap[item._id?.toString()];
      return {
        categoryId: item._id,
        categoryName: cat ? cat.name : 'Unknown',
        type: cat ? cat.type : null,
        totalAmount: item.totalAmount,
        count: item.count
      };
    });

    const expenseByCatFormatted = expenseByCategory.map((item) => {
      const cat = categoryMap[item._id?.toString()];
      return {
        categoryId: item._id,
        categoryName: cat ? cat.name : 'Unknown',
        type: cat ? cat.type : null,
        totalAmount: item.totalAmount,
        count: item.count
      };
    });

    res.json({
      success: true,
      data: {
        totalIncome,
        totalIncomeCount,
        totalExpense,
        totalExpenseCount,
        net: totalIncome - totalExpense,
        incomeByCategory: incomeByCatFormatted,
        expenseByCategory: expenseByCatFormatted
      }
    });
  } catch (error) {
    next(error);
  }
};

// INVOICE CRUD
const getInvoices = async (req, res, next) => {
  try {
    const filters = {};
    const query = req.query;

    if (req.user.college) {
      filters.college = req.user.college;
    }
    if (query.status) {
      filters.status = query.status;
    }
    if (query.studentId) {
      filters.student = query.studentId;
    }
    if (query.accountId) {
      filters.account = query.accountId;
    }
    if (query.startDate || query.endDate) {
      filters.invoiceDate = {};
      if (query.startDate) {
        filters.invoiceDate.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filters.invoiceDate.$lte = new Date(query.endDate);
      }
    }

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy || 'invoiceDate';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const invoices = await Invoice.find(filters)
      .populate('student', 'name studentId')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('savedContent', 'name')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Invoice.countDocuments(filters);

    res.json({
      success: true,
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('student', 'name studentId email phone')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('savedContent', 'name')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

const createInvoice = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    // Calculate amounts
    const items = req.body.items || [];
    const taxCalculationMethod = req.body.taxCalculationMethod || 'total';
    
    // Ensure each item has paidAmount initialized
    items.forEach(item => {
      if (item.paidAmount === undefined) {
        item.paidAmount = 0;
      }
      // Initialize tax fields
      if (item.taxRate === undefined) {
        item.taxRate = 0;
      }
      if (item.taxAmount === undefined) {
        item.taxAmount = 0;
      }
      // Ensure paidAmount doesn't exceed item total (amount + tax)
      const itemTotal = (item.amount || 0) + (item.taxAmount || 0);
      if (item.paidAmount > itemTotal) {
        item.paidAmount = itemTotal;
      }
    });
    
    // Calculate subtotal
    const subtotal = items.reduce((sum, item) => sum + (item.amount || item.quantity * item.unitPrice), 0);
    
    let taxAmount = 0;
    if (taxCalculationMethod === 'product') {
      // Product-level tax: calculate tax for each item and sum
      items.forEach(item => {
        if (item.taxRate > 0) {
          item.taxAmount = (item.amount * item.taxRate) / 100;
        }
      });
      taxAmount = items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
    } else {
      // Total-level tax: calculate tax on subtotal
      const taxRate = req.body.taxRate || 0;
      taxAmount = (subtotal * taxRate) / 100;
      // Reset item tax amounts for total-level tax
      items.forEach(item => {
        item.taxAmount = 0;
        item.taxRate = 0;
      });
    }
    
    const itemDiscountSum = items.reduce((sum, item) => {
      const d = item?.discount !== undefined ? Number(item.discount) : 0;
      return sum + (Number.isFinite(d) ? d : 0);
    }, 0);

    // If invoice.discount isn't provided, treat sum(item.discount) as invoice discount
    // (so it is equal by default).
    const effectiveDiscount = req.body.discount !== undefined ? req.body.discount : itemDiscountSum;

    if (itemDiscountSum > effectiveDiscount) {
      return res.status(400).json({
        success: false,
        message: 'Sum of item discounts cannot be greater than invoice discount'
      });
    }

    const totalAmount = subtotal + taxAmount - effectiveDiscount;
    
    // Calculate paidAmount from items if not explicitly provided (cap at totalAmount = includes tax)
    const itemPaidTotal = items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
    let paidAmount, taxPaidAmount = 0;
    
    if (req.body.paidAmount !== undefined) {
      // If paidAmount is explicitly provided, distribute it for total-level tax
      if (taxCalculationMethod === 'total') {
        const totalPayable = subtotal + taxAmount;
        if (totalPayable > 0) {
          const paymentForItems = req.body.paidAmount * (subtotal / totalPayable);
          taxPaidAmount = req.body.paidAmount * (taxAmount / totalPayable);
          // Distribute to items proportionally
          items.forEach(item => {
            const proportion = item.amount / subtotal;
            item.paidAmount = Math.min(item.amount, paymentForItems * proportion);
          });
          paidAmount = Math.min(req.body.paidAmount, totalAmount);
        } else {
          paidAmount = Math.min(req.body.paidAmount, totalAmount);
        }
      } else {
        // Product-level tax: paidAmount is sum of item paidAmounts
        paidAmount = Math.min(req.body.paidAmount, totalAmount);
      }
    } else {
      // Use item paidAmounts
      if (taxCalculationMethod === 'total') {
        paidAmount = Math.min(itemPaidTotal + (req.body.taxPaidAmount || 0), totalAmount);
        taxPaidAmount = req.body.taxPaidAmount || 0;
      } else {
        paidAmount = Math.min(itemPaidTotal, totalAmount);
      }
    }

    const data = {
      ...req.body,
      items,
      taxCalculationMethod,
      subtotal,
      taxAmount,
      discount: effectiveDiscount,
      totalAmount,
      paidAmount,
      taxPaidAmount,
      balanceAmount: totalAmount - paidAmount,
      college: req.body.college || req.user.college,
      createdBy: req.user._id
    };
    // invoiceNumber is auto-generated in model pre-save when not provided
    if (!data.invoiceNumber) delete data.invoiceNumber;

    const invoice = await Invoice.create(data);
    const populated = await Invoice.findById(invoice._id)
      .populate('student', 'name studentId')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('savedContent', 'name')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Invoice with this number already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const updateInvoice = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // Get tax calculation method
    const taxCalculationMethod = req.body.taxCalculationMethod !== undefined 
      ? req.body.taxCalculationMethod 
      : invoice.taxCalculationMethod || 'total';

    // Recalculate amounts if items are updated
    if (req.body.items) {
      const items = req.body.items;
      // Ensure each item has paidAmount initialized
      items.forEach(item => {
        if (item.paidAmount === undefined) {
          // Preserve existing paidAmount if item index matches
          const existingItem = invoice.items[items.indexOf(item)];
          item.paidAmount = existingItem ? (existingItem.paidAmount || 0) : 0;
        }
        // Initialize tax fields
        if (item.taxRate === undefined) {
          item.taxRate = 0;
        }
        if (item.taxAmount === undefined) {
          item.taxAmount = 0;
        }
        // Ensure paidAmount doesn't exceed item total (amount + tax)
        const itemTotal = (item.amount || 0) + (item.taxAmount || 0);
        if (item.paidAmount > itemTotal) {
          item.paidAmount = itemTotal;
        }
      });
      
      const subtotal = items.reduce((sum, item) => sum + (item.amount || item.quantity * item.unitPrice), 0);
      
      let taxAmount = 0;
      if (taxCalculationMethod === 'product') {
        // Product-level tax: calculate tax for each item and sum
        items.forEach(item => {
          if (item.taxRate > 0) {
            item.taxAmount = (item.amount * item.taxRate) / 100;
          } else {
            item.taxAmount = 0;
          }
        });
        taxAmount = items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
      } else {
        // Total-level tax: calculate tax on subtotal
        const taxRate = req.body.taxRate !== undefined ? req.body.taxRate : invoice.taxRate;
        taxAmount = (subtotal * taxRate) / 100;
        // Reset item tax amounts for total-level tax
        items.forEach(item => {
          item.taxAmount = 0;
          item.taxRate = 0;
        });
      }
      
      const itemDiscountSum = items.reduce((sum, item) => {
        const d = item?.discount !== undefined ? Number(item.discount) : 0;
        return sum + (Number.isFinite(d) ? d : 0);
      }, 0);
      const discount =
        req.body.discount !== undefined ? req.body.discount : itemDiscountSum;

      if (itemDiscountSum > discount) {
        return res.status(400).json({
          success: false,
          message: 'Sum of item discounts cannot be greater than invoice discount'
        });
      }
      const totalAmount = subtotal + taxAmount - discount;

      invoice.items = items;
      invoice.taxCalculationMethod = taxCalculationMethod;
      invoice.subtotal = subtotal;
      invoice.taxAmount = taxAmount;
      invoice.discount = discount;
      invoice.totalAmount = totalAmount;
      if (taxCalculationMethod === 'total') {
        invoice.taxRate = req.body.taxRate !== undefined ? req.body.taxRate : invoice.taxRate;
      }
      
      // Calculate paidAmount from items (cap at totalAmount so tax is included)
      const itemPaidTotal = items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
      invoice.paidAmount = Math.min(itemPaidTotal, totalAmount);
    } else if (req.body.taxRate !== undefined || req.body.discount !== undefined || req.body.taxCalculationMethod !== undefined) {
      const taxRate = req.body.taxRate !== undefined ? req.body.taxRate : invoice.taxRate;
      const discount = req.body.discount !== undefined ? req.body.discount : invoice.discount;
      const itemDiscountSum = invoice.items.reduce((sum, item) => {
        const d = item?.discount !== undefined ? Number(item.discount) : 0;
        return sum + (Number.isFinite(d) ? d : 0);
      }, 0);
      if (itemDiscountSum > discount) {
        return res.status(400).json({
          success: false,
          message: 'Sum of item discounts cannot be greater than invoice discount'
        });
      }
      
      let taxAmount = 0;
      if (taxCalculationMethod === 'product') {
        // Product-level tax: sum item taxes
        taxAmount = invoice.items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
      } else {
        // Total-level tax: calculate on subtotal
        taxAmount = (invoice.subtotal * taxRate) / 100;
        // Reset item tax amounts
        invoice.items.forEach(item => {
          item.taxAmount = 0;
          item.taxRate = 0;
        });
      }
      
      const totalAmount = invoice.subtotal + taxAmount - discount;

      invoice.taxCalculationMethod = taxCalculationMethod;
      invoice.taxRate = taxRate;
      invoice.taxAmount = taxAmount;
      invoice.discount = discount;
      invoice.totalAmount = totalAmount;
    }

    const updatableFields = [
      'invoiceNumber',
      'invoiceDate',
      'dueDate',
      'status',
      'billTo',
      'notes',
      'terms',
      'student',
      'account',
      'savedContent',
      'taxCalculationMethod'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        invoice[field] = req.body[field];
      }
    });
    
    // Handle paidAmount update - if explicitly set, distribute proportionally to items and tax
    if (req.body.paidAmount !== undefined && !req.body.items) {
      if (invoice.taxCalculationMethod === 'total') {
        // For total-level tax: distribute across subtotal + taxAmount
        const totalPayable = invoice.subtotal + invoice.taxAmount;
        if (totalPayable > 0) {
          const paymentForItems = req.body.paidAmount * (invoice.subtotal / totalPayable);
          const paymentForTax = req.body.paidAmount * (invoice.taxAmount / totalPayable);
          
          // Distribute to items proportionally
          if (invoice.subtotal > 0) {
            invoice.items.forEach(item => {
              const proportion = item.amount / invoice.subtotal;
              item.paidAmount = Math.min(item.amount, paymentForItems * proportion);
            });
          }
          
          // Allocate to tax
          invoice.taxPaidAmount = Math.min(invoice.taxAmount, paymentForTax);
          invoice.paidAmount = Math.min(req.body.paidAmount, invoice.totalAmount);
        }
      } else {
        // Product-level tax: distribute by item total (amount + tax)
        const getItemTotal = (item) => (item.amount || 0) + (item.taxAmount || 0);
        const totalItemTotal = invoice.items.reduce((sum, item) => sum + getItemTotal(item), 0);
        if (totalItemTotal > 0) {
          invoice.items.forEach(item => {
            const itemTotal = getItemTotal(item);
            const proportion = itemTotal / totalItemTotal;
            item.paidAmount = Math.min(itemTotal, req.body.paidAmount * proportion);
          });
          invoice.paidAmount = Math.min(req.body.paidAmount, invoice.totalAmount);
        }
      }
    }
    
    // dueDate is optional; allow clearing with null
    if (req.body.hasOwnProperty('dueDate') && req.body.dueDate === null) {
      invoice.dueDate = undefined;
    }

    invoice.updatedBy = req.user._id;
    await invoice.save();

    const updated = await Invoice.findById(invoice._id)
      .populate('student', 'name studentId')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('savedContent', 'name')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Invoice with this number already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// Pay for specific invoice items
const payInvoiceItems = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const { itemPayments, account: accountId, paymentDate, paymentMethod, notes } = req.body;

    if (!Array.isArray(itemPayments) || itemPayments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'itemPayments must be a non-empty array'
      });
    }

    // Item total for payment = amount + tax (so payments can cover tax)
    const getItemTotal = (item) => (item.amount || 0) + (item.taxAmount || 0);

    // Validate and apply payments to items
    itemPayments.forEach(({ itemIndex, amount }) => {
      if (itemIndex < 0 || itemIndex >= invoice.items.length) {
        throw new Error(`Invalid item index: ${itemIndex}`);
      }
      if (amount < 0) {
        throw new Error(`Payment amount must be positive`);
      }

      const item = invoice.items[itemIndex];
      const itemTotal = getItemTotal(item);
      const newPaidAmount = (item.paidAmount || 0) + amount;
      item.paidAmount = Math.min(newPaidAmount, itemTotal); // Cap at item total (amount + tax)
    });

    // Recalculate invoice paidAmount from items (cap at totalAmount)
    if (invoice.taxCalculationMethod === 'total') {
      const itemSumPaid = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
      invoice.paidAmount = Math.min(itemSumPaid + (invoice.taxPaidAmount || 0), invoice.totalAmount);
    } else {
      const sumPaid = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
      invoice.paidAmount = Math.min(sumPaid, invoice.totalAmount);
    }
    invoice.balanceAmount = invoice.totalAmount - invoice.paidAmount;

    // Update status based on balance
    if (invoice.balanceAmount <= 0 && invoice.status === 'sent') {
      invoice.status = 'paid';
    } else if (
      invoice.dueDate &&
      invoice.balanceAmount > 0 &&
      new Date() > invoice.dueDate &&
      invoice.status === 'sent'
    ) {
      invoice.status = 'overdue';
    }

    invoice.updatedBy = req.user._id;
    await invoice.save();

    const totalPaymentAmount = itemPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const resolvedAccountId = accountId || invoice.account;
    let payment = null;

    if (totalPaymentAmount > 0 && resolvedAccountId) {
      const account = await Account.findById(resolvedAccountId);
      if (!account) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }
      const collegeId = invoice.college || req.user.college;
      if (account.college && account.college.toString() !== collegeId.toString()) {
        return res.status(400).json({ success: false, message: 'Account does not belong to invoice college' });
      }

      payment = await Payment.create({
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        amount: totalPaymentAmount,
        paymentMethod: paymentMethod || 'cash',
        status: 'completed',
        account: account._id,
        invoice: invoice._id,
        student: invoice.student,
        college: collegeId,
        notes: notes || `Invoice ${invoice.invoiceNumber || invoice._id} item payment`,
        createdBy: req.user._id
      });

      const lines = await buildPaymentLedgerCreditLines(payment);
      const paymentsCategory = await getOrCreatePaymentsCategory(collegeId, req.user._id);
      const paymentLedger = await Ledger.create({
        entryDate: payment.paymentDate,
        entryType: 'payment',
        lines,
        description: `Payment received: ${payment.paymentNumber}`,
        reference: payment.paymentNumber,
        referenceId: payment._id,
        referenceModel: 'Payment',
        category: paymentsCategory._id,
        student: payment.student,
        college: collegeId,
        createdBy: req.user._id
      });
      await Ledger.applyToAccounts(paymentLedger);
      await Income.create({
        title: `Payment: ${payment.paymentNumber}`,
        amount: payment.amount,
        date: payment.paymentDate,
        category: paymentsCategory._id,
        account: payment.account,
        student: payment.student,
        college: collegeId,
        referenceNumber: payment.paymentNumber,
        notes: payment.notes,
        payment: payment._id,
        createdBy: req.user._id
      });
    }

    const updated = await Invoice.findById(invoice._id)
      .populate('student', 'name studentId')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('savedContent', 'name')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    const response = { success: true, data: updated };
    if (payment) {
      response.payment = await Payment.findById(payment._id)
        .populate('account', 'name accountType')
        .populate('amountSplits.account', 'name accountType')
        .populate('invoice', 'invoiceNumber totalAmount')
        .populate('student', 'name studentId')
        .populate('college', 'name code');
    }
    res.json(response);
  } catch (error) {
    if (error.message.includes('Invalid item index') || error.message.includes('Payment amount')) {
      res.status(400).json({ success: false, message: error.message });
    } else {
      next(error);
    }
  }
};

// Apply item-level discounts while enforcing total discount limit
const applyInvoiceItemDiscounts = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const itemDiscounts = Array.isArray(req.body.itemDiscounts) ? req.body.itemDiscounts : [];
    if (itemDiscounts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'itemDiscounts must be a non-empty array'
      });
    }

    const effectiveDiscount =
      req.body.discount !== undefined ? Number(req.body.discount) : Number(invoice.discount || 0);

    if (!Number.isFinite(effectiveDiscount) || effectiveDiscount < 0) {
      return res.status(400).json({
        success: false,
        message: 'discount must be a non-negative number'
      });
    }

    const seenIndexes = new Set();
    itemDiscounts.forEach((row) => {
      const idx = Number(row.itemIndex);
      const amount = Number(row.discount);

      if (!Number.isInteger(idx) || idx < 0 || idx >= invoice.items.length) {
        throw new Error(`Invalid item index: ${row.itemIndex}`);
      }
      if (seenIndexes.has(idx)) {
        throw new Error(`Duplicate item index: ${idx}`);
      }
      seenIndexes.add(idx);

      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`Discount must be non-negative for item index: ${idx}`);
      }
      if (amount > (invoice.items[idx].amount || 0)) {
        throw new Error(`Item discount cannot exceed item amount for item index: ${idx}`);
      }

      invoice.items[idx].discount = amount;
    });

    const totalItemDiscount = invoice.items.reduce((sum, item) => {
      const d = item?.discount !== undefined ? Number(item.discount) : 0;
      return sum + (Number.isFinite(d) ? d : 0);
    }, 0);

    if (totalItemDiscount > effectiveDiscount) {
      return res.status(400).json({
        success: false,
        message: 'Total item discounts cannot be greater than invoice discount'
      });
    }

    invoice.discount = effectiveDiscount;
    invoice.totalAmount = invoice.subtotal + invoice.taxAmount - effectiveDiscount;
    invoice.paidAmount = Math.min(invoice.paidAmount || 0, invoice.totalAmount);
    invoice.balanceAmount = invoice.totalAmount - invoice.paidAmount;

    if (invoice.balanceAmount <= 0 && invoice.status === 'sent') {
      invoice.status = 'paid';
    } else if (
      invoice.dueDate &&
      invoice.balanceAmount > 0 &&
      new Date() > invoice.dueDate &&
      invoice.status === 'sent'
    ) {
      invoice.status = 'overdue';
    }

    invoice.updatedBy = req.user._id;
    await invoice.save();

    const updated = await Invoice.findById(invoice._id)
      .populate('student', 'name studentId')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('savedContent', 'name')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    return res.json({ success: true, data: updated });
  } catch (error) {
    if (
      error.message.includes('Invalid item index') ||
      error.message.includes('Duplicate item index') ||
      error.message.includes('Discount must be non-negative') ||
      error.message.includes('Item discount cannot exceed item amount')
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

// SAVED INVOICE CONTENT CRUD
const getSavedInvoiceContents = async (req, res, next) => {
  try {
    const filters = {};
    if (req.user.college) {
      filters.college = req.user.college;
    }
    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
    }

    const contents = await SavedInvoiceContent.find(filters)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ name: 1 });

    res.json({ success: true, data: contents });
  } catch (error) {
    next(error);
  }
};

const getSavedInvoiceContentById = async (req, res, next) => {
  try {
    const content = await SavedInvoiceContent.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!content) {
      return res.status(404).json({ success: false, message: 'Saved invoice content not found' });
    }

    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
};

const createSavedInvoiceContent = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const items = req.body.items || [];
    const taxCalculationMethod = req.body.taxCalculationMethod || 'total';
    
    // Initialize tax fields for items
    items.forEach(item => {
      if (item.taxRate === undefined) {
        item.taxRate = 0;
      }
      if (item.taxAmount === undefined) {
        item.taxAmount = 0;
      }
    });
    
    // Calculate subtotal
    const subtotal = items.reduce((sum, item) => sum + (item.amount || item.quantity * item.unitPrice), 0);
    
    let taxAmount = 0;
    if (taxCalculationMethod === 'product') {
      // Product-level tax: calculate tax for each item and sum
      items.forEach(item => {
        if (item.taxRate > 0) {
          item.taxAmount = (item.amount * item.taxRate) / 100;
        }
      });
      taxAmount = items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
    } else {
      // Total-level tax: calculate tax on subtotal
      const taxRate = req.body.taxRate || 0;
      taxAmount = (subtotal * taxRate) / 100;
      // Reset item tax amounts for total-level tax
      items.forEach(item => {
        item.taxAmount = 0;
        item.taxRate = 0;
      });
    }
    
    const itemDiscountSum = items.reduce((sum, item) => {
      const d = item?.discount !== undefined ? Number(item.discount) : 0;
      return sum + (Number.isFinite(d) ? d : 0);
    }, 0);

    // If invoice content discount isn't provided, treat sum(item.discount) as content discount
    // so it is "equal" by default.
    const effectiveDiscount = req.body.discount !== undefined ? req.body.discount : itemDiscountSum;

    if (itemDiscountSum > effectiveDiscount) {
      return res.status(400).json({
        success: false,
        message: 'Sum of item discounts cannot be greater than saved invoice content discount'
      });
    }

    const totalAmount = subtotal + taxAmount - effectiveDiscount;

    const data = {
      ...req.body,
      items,
      taxCalculationMethod,
      subtotal,
      taxAmount,
      discount: effectiveDiscount,
      totalAmount,
      college: req.body.college || req.user.college,
      createdBy: req.user._id
    };

    const content = await SavedInvoiceContent.create(data);
    const populated = await SavedInvoiceContent.findById(content._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Saved invoice content with this name already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const updateSavedInvoiceContent = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const content = await SavedInvoiceContent.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ success: false, message: 'Saved invoice content not found' });
    }

    // Get tax calculation method
    const taxCalculationMethod = req.body.taxCalculationMethod !== undefined 
      ? req.body.taxCalculationMethod 
      : content.taxCalculationMethod || 'total';

    // Recalculate amounts if items are updated
    if (req.body.items) {
      const items = req.body.items;
      // Initialize tax fields
      items.forEach(item => {
        if (item.taxRate === undefined) {
          item.taxRate = 0;
        }
        if (item.taxAmount === undefined) {
          item.taxAmount = 0;
        }
      });
      
      const subtotal = items.reduce((sum, item) => sum + (item.amount || item.quantity * item.unitPrice), 0);
      
      let taxAmount = 0;
      if (taxCalculationMethod === 'product') {
        // Product-level tax: calculate tax for each item and sum
        items.forEach(item => {
          if (item.taxRate > 0) {
            item.taxAmount = (item.amount * item.taxRate) / 100;
          } else {
            item.taxAmount = 0;
          }
        });
        taxAmount = items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
      } else {
        // Total-level tax: calculate tax on subtotal
        const taxRate = req.body.taxRate !== undefined ? req.body.taxRate : content.taxRate;
        taxAmount = (subtotal * taxRate) / 100;
        // Reset item tax amounts for total-level tax
        items.forEach(item => {
          item.taxAmount = 0;
          item.taxRate = 0;
        });
      }
      
      const itemDiscountSum = items.reduce((sum, item) => {
        const d = item?.discount !== undefined ? Number(item.discount) : 0;
        return sum + (Number.isFinite(d) ? d : 0);
      }, 0);

      const discount =
        req.body.discount !== undefined ? req.body.discount : itemDiscountSum;

      if (itemDiscountSum > discount) {
        return res.status(400).json({
          success: false,
          message:
            'Sum of item discounts cannot be greater than saved invoice content discount'
        });
      }

      const totalAmount = subtotal + taxAmount - discount;

      content.items = items;
      content.taxCalculationMethod = taxCalculationMethod;
      content.subtotal = subtotal;
      content.taxAmount = taxAmount;
      content.discount = discount;
      content.totalAmount = totalAmount;
    } else if (req.body.taxRate !== undefined || req.body.discount !== undefined || req.body.taxCalculationMethod !== undefined) {
      const taxRate = req.body.taxRate !== undefined ? req.body.taxRate : content.taxRate;
      const itemDiscountSum = content.items.reduce((sum, item) => {
        const d = item?.discount !== undefined ? Number(item.discount) : 0;
        return sum + (Number.isFinite(d) ? d : 0);
      }, 0);

      const discount =
        req.body.discount !== undefined ? req.body.discount : itemDiscountSum;

      if (itemDiscountSum > discount) {
        return res.status(400).json({
          success: false,
          message:
            'Sum of item discounts cannot be greater than saved invoice content discount'
        });
      }
      
      let taxAmount = 0;
      if (taxCalculationMethod === 'product') {
        // Product-level tax: sum item taxes
        taxAmount = content.items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
      } else {
        // Total-level tax: calculate on subtotal
        taxAmount = (content.subtotal * taxRate) / 100;
        // Reset item tax amounts
        content.items.forEach(item => {
          item.taxAmount = 0;
          item.taxRate = 0;
        });
      }
      
      const totalAmount = content.subtotal + taxAmount - discount;

      content.taxCalculationMethod = taxCalculationMethod;
      content.taxRate = taxRate;
      content.taxAmount = taxAmount;
      content.discount = discount;
      content.totalAmount = totalAmount;
    }

    const updatableFields = [
      'name',
      'description',
      'notes',
      'terms',
      'isActive'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        content[field] = req.body[field];
      }
    });

    content.updatedBy = req.user._id;
    await content.save();

    const updated = await SavedInvoiceContent.findById(content._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Saved invoice content with this name already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const deleteSavedInvoiceContent = async (req, res, next) => {
  try {
    const content = await SavedInvoiceContent.findByIdAndDelete(req.params.id);
    if (!content) {
      return res.status(404).json({ success: false, message: 'Saved invoice content not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// ACCOUNT CRUD
const getAccounts = async (req, res, next) => {
  try {
    const filters = {};
    if (req.user.college) {
      filters.college = req.user.college;
    }
    if (req.query.accountType) {
      filters.accountType = req.query.accountType;
    }
    if (req.query.status) {
      filters.status = req.query.status;
    }

    const accounts = await Account.find(filters)
      .populate('openingBalanceLedger', 'entryDate entryType description lines')
      .populate('openingBalanceLedger.lines.account', 'name accountType')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ name: 1 });

    res.json({ success: true, data: accounts });
  } catch (error) {
    next(error);
  }
};

const getAccountById = async (req, res, next) => {
  try {
    const conditions = { _id: req.params.id };
    if (req.user.college) {
      conditions.college = req.user.college;
    }
    const account = await Account.findOne(conditions)
      .populate('openingBalanceLedger')
      .populate('openingBalanceLedger.lines.account', 'name accountType')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Optionally include ledger entries count or recent entries
    if (req.query.includeLedger === 'true') {
      const ledgerCount = await Ledger.countDocuments({ 'lines.account': account._id });
      const recentLedgers = await Ledger.find({ 'lines.account': account._id })
        .sort({ entryDate: -1 })
        .limit(Number(req.query.ledgerLimit) || 10)
        .populate('lines.account', 'name accountType')
        .populate('category', 'name type')
        .lean();
      return res.json({
        success: true,
        data: {
          ...account.toObject(),
          ledgerCount,
          recentLedgers
        }
      });
    }

    res.json({ success: true, data: account });
  } catch (error) {
    next(error);
  }
};

const createAccount = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const collegeId = req.body.college || req.user.college;

    // Derive balance: if explicit balance is not provided but openingBalance is,
    // use openingBalance as the initial balance so account.balance is in sync.
    const hasBalance = req.body.balance != null;
    const hasOpeningBalance = req.body.openingBalance != null;
    const initialBalance = hasBalance
      ? Number(req.body.balance)
      : hasOpeningBalance
      ? Number(req.body.openingBalance)
      : 0;
      console.log(req.body);
console.log(initialBalance);
console.log(hasBalance);
console.log(hasOpeningBalance);
    const data = {
      ...req.body,
      balance: initialBalance,
      college: collegeId,
      createdBy: req.user._id
    };
console.log(data);
    const account = await Account.create(data);
console.log(account);

    // Link account to ledger: create opening balance entry so every account has at least one ledger record
    const openingAmount = initialBalance;
    const openingDate = req.body.openingBalanceDate ? new Date(req.body.openingBalanceDate) : new Date();
    const transactionType = openingAmount >= 0 ? 'credit' : 'debit';
    const amount = Math.abs(openingAmount);

    const ledgerEntry = await Ledger.create({
      entryDate: openingDate,
      entryType: 'opening',
      lines: [{
        account: account._id,
        transactionType,
        amount,
        balanceAfter: account.balance
      }],
      description: `Opening balance: ${account.name}`,
      reference: account.accountNumber || account._id.toString(),
      referenceId: account._id,
      referenceModel: 'Account',
      college: collegeId,
      createdBy: req.user._id
    });

    account.openingBalanceLedger = ledgerEntry._id;
    if (!account.ledgers) account.ledgers = [];
    account.ledgers.push(ledgerEntry._id);
    await account.save();

    const populated = await Account.findById(account._id)
      .populate('openingBalanceLedger')
      .populate('openingBalanceLedger.lines.account', 'name accountType')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Account with this name already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const updateAccount = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const conditions = { _id: req.params.id };
    if (req.user.college) {
      conditions.college = req.user.college;
    }
    const account = await Account.findOne(conditions);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const oldBalance = account.balance;
    const updatableFields = [
      'name',
      'accountNumber',
      'accountType',
      'bankName',
      'branch',
      'ifscCode',
      'balance',
      'openingBalance',
      'openingBalanceDate',
      'status',
      'description',
      'contactPerson',
      'isDefault'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        account[field] = req.body[field];
      }
    });

    account.updatedBy = req.user._id;

    // Record balance change in linked ledger so account transactions are in ledger
    const newBalance = account.balance;
    if (req.body.balance !== undefined && newBalance !== oldBalance) {
      const delta = newBalance - oldBalance;
      const amount = Math.abs(delta);
      const transactionType = delta >= 0 ? 'credit' : 'debit';
      const collegeId = account.college || req.user.college;
      const adjLedger = await Ledger.create({
        entryDate: new Date(),
        entryType: 'adjustment',
        lines: [{
          account: account._id,
          transactionType,
          amount,
          balanceAfter: newBalance
        }],
        description: `Balance adjustment: ${oldBalance} → ${newBalance}`,
        reference: account.accountNumber || account._id.toString(),
        referenceId: account._id,
        referenceModel: 'Account',
        college: collegeId,
        createdBy: req.user._id
      });
      if (!account.ledgers) account.ledgers = [];
      account.ledgers.push(adjLedger._id);
    }

    await account.save();

    const updated = await Account.findById(account._id)
      .populate('openingBalanceLedger', 'entryDate entryType description lines')
      .populate('openingBalanceLedger.lines.account', 'name accountType')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Account with this name already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    const conditions = { _id: req.params.id };
    if (req.user.college) {
      conditions.college = req.user.college;
    }
    const account = await Account.findOne(conditions);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    await Account.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

/** Get ledger entries linked to an account (transactions recorded for this account). */
const getAccountLedgers = async (req, res, next) => {
  try {
    const conditions = { _id: req.params.id };
    if (req.user.college) {
      conditions.college = req.user.college;
    }
    const account = await Account.findOne(conditions);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const query = req.query;
    const filters = { 'lines.account': account._id };
    if (req.user.college) filters.college = req.user.college;
    if (query.entryType) filters.entryType = query.entryType;
    if (query.startDate || query.endDate) {
      filters.entryDate = {};
      if (query.startDate) filters.entryDate.$gte = new Date(query.startDate);
      if (query.endDate) filters.entryDate.$lte = new Date(query.endDate);
    }

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy || 'entryDate';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const ledgers = await Ledger.find(filters)
      .populate('lines.account', 'name accountType')
      .populate('category', 'name type')
      .populate('student', 'name studentId')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Ledger.countDocuments(filters);

    res.json({
      success: true,
      data: ledgers,
      account: { _id: account._id, name: account.name, accountType: account.accountType, balance: account.balance },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

// LEDGER CRUD
const getLedgers = async (req, res, next) => {
  try {
    const filters = {};
    const query = req.query;

    // Scope to college: each college has its own set of ledger records
    if (req.user.college) {
      filters.college = req.user.college;
    } else if (query.collegeId) {
      filters.college = query.collegeId;
    }
    if (query.accountId) {
      filters['lines.account'] = query.accountId;
    }
    if (query.entryType) {
      filters.entryType = query.entryType;
    }
    if (query.startDate || query.endDate) {
      filters.entryDate = {};
      if (query.startDate) {
        filters.entryDate.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filters.entryDate.$lte = new Date(query.endDate);
      }
    }

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy || 'entryDate';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const ledgers = await Ledger.find(filters)
      .populate('lines.account', 'name accountType')
      .populate('category', 'name type')
      .populate('student', 'name studentId')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Ledger.countDocuments(filters);

    res.json({
      success: true,
      data: ledgers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getLedgerById = async (req, res, next) => {
  try {
    const conditions = { _id: req.params.id };
    if (req.user.college) {
      conditions.college = req.user.college;
    }
    const ledger = await Ledger.findOne(conditions)
      .populate('lines.account', 'name accountType')
      .populate('category', 'name type')
      .populate('student', 'name studentId')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!ledger) {
      return res.status(404).json({ success: false, message: 'Ledger entry not found' });
    }

    res.json({ success: true, data: ledger });
  } catch (error) {
    next(error);
  }
};

const createLedger = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const lines = req.body.lines;
    if (!lines || !Array.isArray(lines) || lines.length < 1) {
      return res.status(400).json({ success: false, message: 'At least one line (account, transactionType, amount) is required' });
    }

    const collegeId = req.body.college || req.user.college;
    if (!collegeId) {
      return res.status(400).json({ success: false, message: 'College is required for ledger entries' });
    }

    const builtLines = [];
    for (const line of lines) {
      const acc = await Account.findById(line.account);
      if (!acc) {
        return res.status(404).json({ success: false, message: `Account not found: ${line.account}` });
      }
      const amount = Math.abs(Number(line.amount)) || 0;
      const transactionType = line.transactionType === 'credit' ? 'credit' : 'debit';
      let balanceAfter = acc.balance;
      if (transactionType === 'credit') balanceAfter += amount;
      else balanceAfter -= amount;
      builtLines.push({
        account: acc._id,
        transactionType,
        amount,
        balanceAfter
      });
    }

    const data = {
      entryDate: req.body.entryDate || new Date(),
      entryType: req.body.entryType,
      lines: builtLines,
      description: req.body.description,
      reference: req.body.reference,
      referenceId: req.body.referenceId,
      referenceModel: req.body.referenceModel,
      category: req.body.category,
      student: req.body.student,
      college: collegeId,
      notes: req.body.notes,
      createdBy: req.user._id
    };

    const ledger = await Ledger.create(data);
    await Ledger.applyToAccounts(ledger);

    const populated = await Ledger.findById(ledger._id)
      .populate('lines.account', 'name accountType')
      .populate('category', 'name type')
      .populate('student', 'name studentId')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

const updateLedger = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const conditions = { _id: req.params.id };
    if (req.user.college) {
      conditions.college = req.user.college;
    }
    const ledger = await Ledger.findOne(conditions);
    if (!ledger) {
      return res.status(404).json({ success: false, message: 'Ledger entry not found' });
    }

    if (req.body.lines !== undefined) {
      if (!Array.isArray(req.body.lines) || req.body.lines.length < 1) {
        return res.status(400).json({ success: false, message: 'At least one line (account, transactionType, amount) is required' });
      }
      await Ledger.revertFromAccounts(ledger);
      const builtLines = [];
      for (const line of req.body.lines) {
        const acc = await Account.findById(line.account);
        if (!acc) {
          return res.status(404).json({ success: false, message: `Account not found: ${line.account}` });
        }
        const amount = Math.abs(Number(line.amount)) || 0;
        const transactionType = line.transactionType === 'credit' ? 'credit' : 'debit';
        let balanceAfter = acc.balance;
        if (transactionType === 'credit') balanceAfter += amount;
        else balanceAfter -= amount;
        builtLines.push({ account: acc._id, transactionType, amount, balanceAfter });
      }
      ledger.lines = builtLines;
    }

    const updatableFields = [
      'entryDate',
      'entryType',
      'description',
      'reference',
      'referenceId',
      'referenceModel',
      'category',
      'student',
      'college',
      'notes'
    ];
    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        ledger[field] = req.body[field];
      }
    });

    ledger.updatedBy = req.user._id;
    await ledger.save();

    if (req.body.lines !== undefined && Array.isArray(req.body.lines) && req.body.lines.length >= 1) {
      await Ledger.applyToAccounts(ledger);
    }

    const updated = await Ledger.findById(ledger._id)
      .populate('lines.account', 'name accountType')
      .populate('category', 'name type')
      .populate('student', 'name studentId')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const deleteLedger = async (req, res, next) => {
  try {
    const conditions = { _id: req.params.id };
    if (req.user.college) {
      conditions.college = req.user.college;
    }
    const ledger = await Ledger.findOne(conditions);
    if (!ledger) {
      return res.status(404).json({ success: false, message: 'Ledger entry not found' });
    }

    await Ledger.revertFromAccounts(ledger);
    await Ledger.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// PAYMENT CRUD
const getPayments = async (req, res, next) => {
  try {
    const filters = {};
    const query = req.query;

    if (req.user.college) {
      filters.college = req.user.college;
    }
    if (query.status) {
      filters.status = query.status;
    }
    if (query.paymentMethod) {
      filters.paymentMethod = query.paymentMethod;
    }
    if (query.invoiceId) {
      filters.invoice = query.invoiceId;
    }
    if (query.studentId) {
      filters.student = query.studentId;
    }
    if (query.accountId) {
      filters.account = query.accountId;
    }
    if (query.startDate || query.endDate) {
      filters.paymentDate = {};
      if (query.startDate) {
        filters.paymentDate.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filters.paymentDate.$lte = new Date(query.endDate);
      }
    }

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy || 'paymentDate';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const payments = await Payment.find(filters)
      .populate('invoice', 'invoiceNumber totalAmount')
      .populate('student', 'name studentId')
      .populate('account', 'name accountType')
      .populate('amountSplits.account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Payment.countDocuments(filters);

    res.json({
      success: true,
      data: payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getPaymentById = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('invoice', 'invoiceNumber totalAmount balanceAmount')
      .populate('student', 'name studentId')
      .populate('account', 'name accountType')
      .populate('amountSplits.account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

const createPayment = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const collegeId = req.body.college || req.user.college;
    try {
      await assertPaymentAccountsValid(req.body, collegeId);
    } catch (e) {
      if (e.statusCode) {
        return res.status(e.statusCode).json({ success: false, message: e.message });
      }
      throw e;
    }

    const data = {
      ...req.body,
      college: collegeId,
      createdBy: req.user._id
    };
    delete data.amountSplits;
    delete data.accountSplits;
    // paymentNumber is auto-generated in model pre-save when not provided
    if (!data.paymentNumber) delete data.paymentNumber;

    const normalizedSplits = normalizeAmountSplitsFromBody(req.body);
    if (normalizedSplits) {
      data.amountSplits = normalizedSplits;
    }

    const payment = await Payment.create(data);

    // Update invoice if linked
    if (req.body.invoice) {
      const invoice = await Invoice.findById(req.body.invoice);
      if (invoice && payment.status === 'completed') {
        // Item total for payment = amount + tax (so payments can cover tax)
        const getItemTotal = (item) => (item.amount || 0) + (item.taxAmount || 0);

        // If itemPayments are provided, apply payments to specific items
        if (req.body.itemPayments && Array.isArray(req.body.itemPayments)) {
          req.body.itemPayments.forEach(({ itemIndex, amount }) => {
            if (itemIndex >= 0 && itemIndex < invoice.items.length) {
              const item = invoice.items[itemIndex];
              const itemTotal = getItemTotal(item);
              const newPaidAmount = (item.paidAmount || 0) + amount;
              item.paidAmount = Math.min(newPaidAmount, itemTotal);
            }
          });
          
          // Recalculate invoice paidAmount
          if (invoice.taxCalculationMethod === 'total') {
            // For total-level tax: items + taxPaidAmount
            const itemSumPaid = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
            invoice.paidAmount = Math.min(itemSumPaid + (invoice.taxPaidAmount || 0), invoice.totalAmount);
          } else {
            // Product-level tax: tax is included in item.paidAmount
            const sumPaid = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
            invoice.paidAmount = Math.min(sumPaid, invoice.totalAmount);
          }
        } else {
          // Default behavior: distribute payment proportionally across unpaid amount (items + tax)
          if (invoice.taxCalculationMethod === 'total') {
            // For total-level tax: distribute across subtotal + taxAmount
            const itemSumPaid = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
            const taxPaid = invoice.taxPaidAmount || 0;
            const unpaidSubtotal = invoice.subtotal - itemSumPaid;
            const unpaidTax = invoice.taxAmount - taxPaid;
            const totalUnpaid = unpaidSubtotal + unpaidTax;
            
            if (totalUnpaid > 0) {
              // Allocate payment proportionally: first to items, then to tax
              const paymentForItems = Math.min(payment.amount * (unpaidSubtotal / totalUnpaid), unpaidSubtotal);
              const paymentForTax = Math.min(payment.amount - paymentForItems, unpaidTax);
              
              // Distribute paymentForItems across items proportionally
              if (unpaidSubtotal > 0 && paymentForItems > 0) {
                const unpaidItems = invoice.items.filter(item => (item.paidAmount || 0) < item.amount);
                if (unpaidItems.length > 0) {
                  const totalUnpaidItems = unpaidItems.reduce((sum, item) => sum + (item.amount - (item.paidAmount || 0)), 0);
                  unpaidItems.forEach(item => {
                    const itemUnpaid = item.amount - (item.paidAmount || 0);
                    const proportion = itemUnpaid / totalUnpaidItems;
                    const itemPayment = Math.min(paymentForItems * proportion, itemUnpaid);
                    item.paidAmount = (item.paidAmount || 0) + itemPayment;
                  });
                }
              }
              
              // Allocate remaining to tax
              if (paymentForTax > 0) {
                invoice.taxPaidAmount = Math.min((invoice.taxPaidAmount || 0) + paymentForTax, invoice.taxAmount);
              }
              
              const finalItemSum = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
              invoice.paidAmount = Math.min(finalItemSum + (invoice.taxPaidAmount || 0), invoice.totalAmount);
            } else {
              invoice.paidAmount = Math.min((invoice.paidAmount || 0) + payment.amount, invoice.totalAmount);
            }
          } else {
            // Product-level tax: distribute across items (tax included in item totals)
            const unpaidItems = invoice.items.filter(item => (item.paidAmount || 0) < getItemTotal(item));
            if (unpaidItems.length > 0) {
              const totalUnpaid = unpaidItems.reduce((sum, item) => sum + (getItemTotal(item) - (item.paidAmount || 0)), 0);
              unpaidItems.forEach(item => {
                const itemTotal = getItemTotal(item);
                const itemUnpaid = itemTotal - (item.paidAmount || 0);
                const proportion = itemUnpaid / totalUnpaid;
                const paymentForItem = Math.min(payment.amount * proportion, itemUnpaid);
                item.paidAmount = Math.min((item.paidAmount || 0) + paymentForItem, itemTotal);
              });
              const sumPaid = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
              invoice.paidAmount = Math.min(sumPaid, invoice.totalAmount);
            } else {
              invoice.paidAmount = Math.min((invoice.paidAmount || 0) + payment.amount, invoice.totalAmount);
            }
          }
        }
        invoice.balanceAmount = invoice.totalAmount - invoice.paidAmount;
        if (invoice.balanceAmount <= 0) {
          invoice.status = 'paid';
        }
        invoice.updatedBy = req.user._id;
        await invoice.save();
      }
    }

    // Completed: one ledger credit line per split (each line uses split.account or payment.account).
    // Ledger.applyToAccounts applies each line.balanceAfter to that line's account (multiple accounts supported).
    if (payment.status === 'completed') {
      const lines = await buildPaymentLedgerCreditLines(payment);
      const paymentsCategory = await getOrCreatePaymentsCategory(payment.college, req.user._id);
      const paymentLedger = await Ledger.create({
        entryDate: payment.paymentDate,
        entryType: 'payment',
        lines,
        description: `Payment received: ${payment.paymentNumber}`,
        reference: payment.paymentNumber,
        referenceId: payment._id,
        referenceModel: 'Payment',
        category: paymentsCategory._id,
        student: payment.student,
        college: payment.college,
        createdBy: req.user._id
      });
      await Ledger.applyToAccounts(paymentLedger);

      // Record payment as income in Finance (Payments category) for tracking and reports
      await Income.create({
        title: `Payment: ${payment.paymentNumber}`,
        amount: payment.amount,
        date: payment.paymentDate,
        category: paymentsCategory._id,
        account: payment.account,
        student: payment.student,
        college: payment.college,
        referenceNumber: payment.paymentNumber,
        notes: payment.notes || (payment.invoice ? `Invoice payment` : 'Payment received'),
        payment: payment._id,
        createdBy: req.user._id
      });
    }

    const populated = await Payment.findById(payment._id)
      .populate('invoice', 'invoiceNumber totalAmount')
      .populate('student', 'name studentId')
      .populate('account', 'name accountType')
      .populate('amountSplits.account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message || 'Validation failed',
        errors: error.errors
      });
    }
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Payment with this number already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const updatePayment = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const oldStatus = payment.status;

    const updatableFields = [
      'paymentNumber',
      'paymentDate',
      'amount',
      'paymentMethod',
      'status',
      'account',
      'invoice',
      'student',
      'referenceNumber',
      'transactionId',
      'chequeNumber',
      'chequeDate',
      'bankName',
      'description',
      'notes'
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        payment[field] = req.body[field];
      }
    });

    if (req.body.amountSplits !== undefined || req.body.accountSplits !== undefined) {
      payment.amountSplits = normalizeAmountSplitsFromBody(req.body);
    }

    try {
      await assertPaymentAccountsValid(
        {
          account: payment.account,
          amountSplits: payment.amountSplits
        },
        payment.college
      );
    } catch (e) {
      if (e.statusCode) {
        return res.status(e.statusCode).json({ success: false, message: e.message });
      }
      throw e;
    }

    payment.updatedBy = req.user._id;
    await payment.save();

    const ledgerNeedsRebuild =
      oldStatus === 'completed' &&
      payment.status === 'completed' &&
      (req.body.amount !== undefined ||
        req.body.account !== undefined ||
        req.body.amountSplits !== undefined ||
        req.body.accountSplits !== undefined ||
        req.body.paymentDate !== undefined);

    // Handle status changes — ledger lines mirror splits (per-account credits); revert before delete/rebuild
    if (oldStatus === 'completed' && payment.status !== 'completed') {
      const ledger = await Ledger.findOne({
        referenceId: payment._id,
        referenceModel: 'Payment'
      });
      if (ledger) {
        await Ledger.revertFromAccounts(ledger);
        await Ledger.findByIdAndDelete(ledger._id);
      }
      await Income.findOneAndUpdate(
        { payment: payment._id },
        { isCancelled: true, updatedBy: req.user._id }
      );
    } else if (oldStatus !== 'completed' && payment.status === 'completed') {
      const lines = await buildPaymentLedgerCreditLines(payment);
      const paymentsCategory = await getOrCreatePaymentsCategory(payment.college, req.user._id);
      const paymentLedger = await Ledger.create({
        entryDate: payment.paymentDate,
        entryType: 'payment',
        lines,
        description: `Payment received: ${payment.paymentNumber}`,
        reference: payment.paymentNumber,
        referenceId: payment._id,
        referenceModel: 'Payment',
        category: paymentsCategory._id,
        student: payment.student,
        college: payment.college,
        createdBy: req.user._id
      });
      await Ledger.applyToAccounts(paymentLedger);
      await Income.create({
        title: `Payment: ${payment.paymentNumber}`,
        amount: payment.amount,
        date: payment.paymentDate,
        category: paymentsCategory._id,
        account: payment.account,
        student: payment.student,
        college: payment.college,
        referenceNumber: payment.paymentNumber,
        notes: payment.notes || (payment.invoice ? `Invoice payment` : 'Payment received'),
        payment: payment._id,
        createdBy: req.user._id
      });
    } else if (ledgerNeedsRebuild) {
      const ledger = await Ledger.findOne({
        referenceId: payment._id,
        referenceModel: 'Payment'
      });
      if (ledger) {
        await Ledger.revertFromAccounts(ledger);
        const lines = await buildPaymentLedgerCreditLines(payment);
        const paymentsCategory = await getOrCreatePaymentsCategory(payment.college, req.user._id);
        ledger.lines = lines;
        ledger.entryDate = payment.paymentDate;
        ledger.category = paymentsCategory._id;
        ledger.updatedBy = req.user._id;
        await ledger.save();
        await Ledger.applyToAccounts(ledger);
      }
      await Income.findOneAndUpdate(
        { payment: payment._id },
        {
          amount: payment.amount,
          date: payment.paymentDate,
          account: payment.account,
          updatedBy: req.user._id
        }
      );
    }

    // Update invoice if linked
    if (payment.invoice) {
      const invoice = await Invoice.findById(payment.invoice);
      if (invoice) {
        if (payment.status === 'completed') {
          // Recalculate paid amount from item-level payments (cap at totalAmount so tax is included)
          if (invoice.taxCalculationMethod === 'total') {
            const itemSumPaid = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
            invoice.paidAmount = Math.min(itemSumPaid + (invoice.taxPaidAmount || 0), invoice.totalAmount);
          } else {
            const sumPaid = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
            invoice.paidAmount = Math.min(sumPaid, invoice.totalAmount);
          }
          invoice.balanceAmount = invoice.totalAmount - invoice.paidAmount;
          if (invoice.balanceAmount <= 0) {
            invoice.status = 'paid';
          } else if (invoice.dueDate && new Date() > invoice.dueDate) {
            invoice.status = 'overdue';
          }
        }
        invoice.updatedBy = req.user._id;
        await invoice.save();
      }
    }

    const updated = await Payment.findById(payment._id)
      .populate('invoice', 'invoiceNumber totalAmount')
      .populate('student', 'name studentId')
      .populate('account', 'name accountType')
      .populate('amountSplits.account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message || 'Validation failed',
        errors: error.errors
      });
    }
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: 'Payment with this number already exists for this college'
      });
    } else {
      next(error);
    }
  }
};

const deletePayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Revert account balance and unlink ledger if payment was completed
    if (payment.status === 'completed') {
      const ledger = await Ledger.findOne({
        referenceId: payment._id,
        referenceModel: 'Payment'
      });
      if (ledger) {
        await Ledger.revertFromAccounts(ledger);
        await Ledger.findByIdAndDelete(ledger._id);
      }

      // Cancel the income record linked to this payment (keep for history, exclude from reports)
      await Income.findOneAndUpdate(
        { payment: payment._id },
        { isCancelled: true, updatedBy: req.user._id }
      );

      // Update invoice - recalculate from items (cap at totalAmount)
      if (payment.invoice) {
        const invoice = await Invoice.findById(payment.invoice);
        if (invoice) {
          if (invoice.taxCalculationMethod === 'total') {
            const itemSumPaid = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
            invoice.paidAmount = Math.min(itemSumPaid + (invoice.taxPaidAmount || 0), invoice.totalAmount);
          } else {
            const sumPaid = invoice.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
            invoice.paidAmount = Math.min(sumPaid, invoice.totalAmount);
          }
          invoice.balanceAmount = invoice.totalAmount - invoice.paidAmount;
          if (invoice.balanceAmount > 0 && invoice.status === 'paid') {
            invoice.status = 'sent';
          }
          invoice.updatedBy = req.user._id;
          await invoice.save();
        }
      }
    }

    await Payment.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // categories
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  // income
  getIncomes,
  getIncomeById,
  createIncome,
  updateIncome,
  deleteIncome,
  // expense
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  // summary
  getFinanceSummary,
  // invoice
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  payInvoiceItems,
  applyInvoiceItemDiscounts,
  // saved invoice content
  getSavedInvoiceContents,
  getSavedInvoiceContentById,
  createSavedInvoiceContent,
  updateSavedInvoiceContent,
  deleteSavedInvoiceContent,
  // account
  getAccounts,
  getAccountById,
  getAccountLedgers,
  createAccount,
  updateAccount,
  deleteAccount,
  // ledger
  getLedgers,
  getLedgerById,
  createLedger,
  updateLedger,
  deleteLedger,
  // payment
  getPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment
};


