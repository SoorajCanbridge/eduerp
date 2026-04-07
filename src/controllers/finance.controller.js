const { validationResult } = require('express-validator');
const Income = require('../models/income.model');
const Expense = require('../models/expense.model');
const RecurringExpense = require('../models/recurringExpense.model');
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

const normalizeRecurringRecipient = (body) => {
  if (!body.recipient || typeof body.recipient !== 'object') {
    return undefined;
  }
  return {
    name: body.recipient.name != null ? String(body.recipient.name).trim() : undefined,
    phone: body.recipient.phone != null ? String(body.recipient.phone).trim() : undefined,
    email: body.recipient.email != null ? String(body.recipient.email).trim().toLowerCase() : undefined,
    address: body.recipient.address != null ? String(body.recipient.address).trim() : undefined
  };
};

const buildRecurringExpensePayload = (req, { isCreate }) => {
  const b = req.body;
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const data = {};

  const set = (key, value) => {
    if (isCreate) {
      if (value !== undefined) data[key] = value;
    } else if (has(key)) {
      data[key] = value;
    }
  };

  set('title', b.title);
  set('amount', b.amount != null ? Number(b.amount) : undefined);
  set('category', b.category);
  set('account', b.account);
  set('vendor', b.vendor != null ? String(b.vendor).trim() : undefined);
  set('referenceNumber', b.referenceNumber != null ? String(b.referenceNumber).trim() : undefined);
  set('notes', b.notes != null ? String(b.notes).trim() : undefined);
  set('frequency', b.frequency);
  set('interval', b.interval != null ? Number(b.interval) : undefined);
  set('startDate', b.startDate ? new Date(b.startDate) : undefined);
  set('endDate', b.endDate ? new Date(b.endDate) : undefined);
  set('nextDueDate', b.nextDueDate ? new Date(b.nextDueDate) : undefined);
  set('isActive', b.isActive);

  if (isCreate) {
    data.college = b.college || req.user.college;
  } else if (has('college')) {
    data.college = b.college;
  }

  if (isCreate) {
    if (Array.isArray(b.files)) {
      data.files = b.files.filter((p) => typeof p === 'string' && p.trim());
    } else {
      data.files = [];
    }
  } else if (has('files') && Array.isArray(b.files)) {
    data.files = b.files.filter((p) => typeof p === 'string' && p.trim());
  }

  if (isCreate || has('recipient')) {
    const rec = normalizeRecurringRecipient(b);
    if (rec) {
      data.recipient = rec;
    } else if (has('recipient') && (b.recipient === null || (typeof b.recipient === 'object' && !Object.keys(b.recipient || {}).length))) {
      data.recipient = undefined;
    }
  }

  if (isCreate) {
    data.createdBy = req.user._id;
  }

  return data;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const getRecurringAnalytics = (recurringDoc, now = new Date()) => {
  const due = recurringDoc?.nextDueDate ? new Date(recurringDoc.nextDueDate) : null;
  const isActive = recurringDoc?.isActive !== false;
  const isOverdue = Boolean(
    isActive &&
      due &&
      !Number.isNaN(due.getTime()) &&
      due.getTime() < now.getTime()
  );

  let overdueDays = 0;
  if (isOverdue) {
    overdueDays = Math.max(1, Math.floor((now.getTime() - due.getTime()) / DAY_MS));
  }

  let missedPayments = 0;
  if (isOverdue && recurringDoc?.frequency) {
    const interval = Math.max(1, Number(recurringDoc.interval) || 1);
    if (recurringDoc.frequency === 'daily') {
      missedPayments = Math.max(1, Math.floor(overdueDays / interval));
    } else if (recurringDoc.frequency === 'weekly') {
      missedPayments = Math.max(1, Math.floor(overdueDays / (interval * 7)));
    } else if (recurringDoc.frequency === 'monthly') {
      const monthsDiff =
        (now.getFullYear() - due.getFullYear()) * 12 + (now.getMonth() - due.getMonth());
      missedPayments = Math.max(1, Math.floor(monthsDiff / interval));
    } else if (recurringDoc.frequency === 'yearly') {
      const yearsDiff = now.getFullYear() - due.getFullYear();
      missedPayments = Math.max(1, Math.floor(yearsDiff / interval));
    }
  }

  return {
    isOverdue,
    overdueDays,
    missedPayments,
    currentStatus: isActive ? (isOverdue ? 'overdue' : 'active') : 'paused'
  };
};

const toRecurringWithAnalytics = (doc) => {
  const raw = doc?.toObject ? doc.toObject() : doc;
  if (!raw) return raw;
  return {
    ...raw,
    ...getRecurringAnalytics(raw)
  };
};

// RECURRING EXPENSE CRUD
const getRecurringExpenses = async (req, res, next) => {
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
    if (query.isActive !== undefined) {
      filters.isActive = query.isActive === 'true';
    }
    if (query.startDate || query.endDate) {
      filters.nextDueDate = {};
      if (query.startDate) {
        filters.nextDueDate.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filters.nextDueDate.$lte = new Date(query.endDate);
      }
    }

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy || 'nextDueDate';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const list = await RecurringExpense.find(filters)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await RecurringExpense.countDocuments(filters);

    res.json({
      success: true,
      data: list.map((item) => toRecurringWithAnalytics(item)),
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

const getRecurringExpenseById = async (req, res, next) => {
  try {
    const doc = await RecurringExpense.findById(req.params.id)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Recurring expense not found' });
    }

    res.json({ success: true, data: toRecurringWithAnalytics(doc) });
  } catch (error) {
    next(error);
  }
};

const createRecurringExpense = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const category = await FinanceCategory.findById(req.body.category);
    if (!category || (category.type !== 'expense' && category.type !== 'both')) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid category for recurring expense' });
    }

    const data = buildRecurringExpensePayload(req, { isCreate: true });
    if (data.interval == null || Number.isNaN(data.interval) || data.interval < 1) {
      data.interval = 1;
    }

    const doc = await RecurringExpense.create(data);
    const populated = await RecurringExpense.findById(doc._id)
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

const updateRecurringExpense = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const doc = await RecurringExpense.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Recurring expense not found' });
    }

    if (req.body.category) {
      const category = await FinanceCategory.findById(req.body.category);
      if (!category || (category.type !== 'expense' && category.type !== 'both')) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid category for recurring expense' });
      }
    }

    if (req.body.account) {
      const account = await Account.findById(req.body.account);
      if (!account) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }
    }

    const patch = buildRecurringExpensePayload(req, { isCreate: false });
    const updatableKeys = [
      'title',
      'amount',
      'category',
      'account',
      'vendor',
      'college',
      'referenceNumber',
      'notes',
      'files',
      'frequency',
      'interval',
      'startDate',
      'endDate',
      'nextDueDate',
      'isActive',
      'recipient'
    ];

    updatableKeys.forEach((key) => {
      if (patch[key] !== undefined) {
        doc[key] = patch[key];
      }
    });

    if (doc.interval == null || Number.isNaN(doc.interval) || doc.interval < 1) {
      doc.interval = 1;
    }

    doc.updatedBy = req.user._id;
    await doc.save();

    const updated = await RecurringExpense.findById(doc._id)
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

const deleteRecurringExpense = async (req, res, next) => {
  try {
    const doc = await RecurringExpense.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Recurring expense not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getRecurringExpensePaymentHistory = async (req, res, next) => {
  try {
    const recurring = await RecurringExpense.findById(req.params.id);
    if (!recurring) {
      return res.status(404).json({ success: false, message: 'Recurring expense not found' });
    }
    if (recurring.college && req.user.college && recurring.college.toString() !== req.user.college.toString()) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const filters = {
      recurringExpense: recurring._id
    };
    if (req.user.college) {
      filters.college = req.user.college;
    }

    const history = await Expense.find(filters)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Expense.countDocuments(filters);

    res.json({
      success: true,
      data: history,
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

const recurringPaymentStatuses = ['pending', 'completed', 'failed', 'cancelled', 'refunded'];

const addMonthsWithClamp = (date, monthsToAdd) => {
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();
  const targetMonthIndex = m + monthsToAdd;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(
    targetYear,
    targetMonth,
    Math.min(day, lastDay),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
};

const computeNextRecurringDueDate = (recurring, fromDate) => {
  const interval = Number(recurring.interval) || 1;
  const d = new Date(fromDate);
  if (Number.isNaN(d.getTime())) return new Date();

  if (recurring.frequency === 'daily') {
    d.setDate(d.getDate() + interval);
  } else if (recurring.frequency === 'weekly') {
    d.setDate(d.getDate() + interval * 7);
  } else if (recurring.frequency === 'monthly') {
    return addMonthsWithClamp(d, interval);
  } else if (recurring.frequency === 'yearly') {
    return addMonthsWithClamp(d, interval * 12);
  } else {
    // Fallback to daily
    d.setDate(d.getDate() + interval);
  }

  return d;
};

// Pay a recurring expense schedule by creating a one-off Expense document.
// Expense schema hooks will update Account balances and Ledger automatically.
const payRecurringPayment = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    const { recurringExpenseId, paymentBy, paymentDate, paymentStatus, account: overrideAccount } = req.body;

    if (!recurringExpenseId) {
      return res.status(400).json({ success: false, message: 'recurringExpenseId is required' });
    }

    const status = paymentStatus || 'completed';
    if (!recurringPaymentStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid paymentStatus' });
    }

    const payDate = paymentDate ? new Date(paymentDate) : new Date();
    if (Number.isNaN(payDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid paymentDate' });
    }

    const recurring = await RecurringExpense.findById(recurringExpenseId);
    if (!recurring) {
      return res.status(404).json({ success: false, message: 'Recurring expense not found' });
    }

    // Scope enforcement for multi-college setups
    if (recurring.college && req.user.college && recurring.college.toString() !== req.user.college.toString()) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    let createdExpense = null;
    const paymentAccountId = overrideAccount || recurring.account;

    if (!paymentAccountId) {
      return res.status(400).json({ success: false, message: 'Account is required' });
    }

    const accountDoc = await Account.findById(paymentAccountId);
    if (!accountDoc) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    if (
      recurring.college &&
      accountDoc.college &&
      recurring.college.toString() !== accountDoc.college.toString()
    ) {
      return res.status(400).json({ success: false, message: 'Account does not belong to the same college' });
    }

    if (status === 'completed') {
      if (!recurring.isActive) {
        return res.status(400).json({ success: false, message: 'Recurring expense is not active' });
      }

      const baseNotes = [];
      if (recurring.notes) baseNotes.push(recurring.notes);
      if (paymentBy && String(paymentBy).trim()) baseNotes.push(`Paid by: ${String(paymentBy).trim()}`);

      const recipient =
        recurring.recipient && typeof recurring.recipient === 'object'
          ? recurring.recipient
          : undefined;
      const hasRecipient =
        recipient && (recipient.name || recipient.phone || recipient.email || recipient.address);

      const expensePayload = {
        title: recurring.title,
        amount: recurring.amount,
        date: payDate,
        category: recurring.category,
        account: paymentAccountId,
        recurringExpense: recurring._id,
        vendor: recurring.vendor,
        ...(hasRecipient ? { recipient } : {}),
        college: recurring.college || req.user.college,
        referenceNumber: recurring.referenceNumber,
        notes: baseNotes.length ? baseNotes.join(' | ') : undefined,
        files: Array.isArray(recurring.files) ? recurring.files : [],
        createdBy: req.user._id
      };

      createdExpense = await Expense.create(expensePayload);
    }

    // Update recurring schedule status / next due date
    const next = {};
    if (status === 'completed') {
      next.paymentCount = (recurring.paymentCount || 0) + 1;
      const baseDueDate =
        recurring.nextDueDate && !Number.isNaN(new Date(recurring.nextDueDate).getTime())
          ? recurring.nextDueDate
          : payDate;
      next.nextDueDate = computeNextRecurringDueDate(recurring, baseDueDate);
      next.isActive = recurring.endDate ? next.nextDueDate <= recurring.endDate : true;
    } else if (['failed', 'cancelled', 'refunded'].includes(status)) {
      next.isActive = false;
    }

    if (paymentBy && String(paymentBy).trim()) next.lastPaymentBy = String(paymentBy).trim();
    next.lastPaymentDate = payDate;
    next.lastPaymentStatus = status;
    next.updatedBy = req.user._id;

    await RecurringExpense.findByIdAndUpdate(recurringExpenseId, { $set: next }, { new: false });

    const updatedRecurring = await RecurringExpense.findById(recurringExpenseId)
      .populate('category', 'name type')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({
      success: true,
      data: {
        recurring: toRecurringWithAnalytics(updatedRecurring),
        expense: createdExpense ? await Expense.findById(createdExpense._id)
          .populate('category', 'name type')
          .populate('account', 'name accountType')
          .populate('college', 'name code')
          .populate('createdBy', 'name email')
          .populate('updatedBy', 'name email') : null
      }
    });
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

const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

const createInvoice = async (req, res, next) => {
  if (handleValidation(req, res)) return;

  try {
    let items = Array.isArray(req.body.items) ? req.body.items : [];
    const taxCalculationMethod = req.body.taxCalculationMethod || 'total';

    // 🔹 Normalize items
    items = items.map((item) => {
      const amount =
        item.amount !== undefined
          ? Number(item.amount)
          : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

      return {
        ...item,
        amount: round2(amount),
        discount: round2(item.discount || 0),
        taxRate: round2(item.taxRate || 0),
        taxAmount: 0,
        paidAmount: round2(item.paidAmount || 0),
      };
    });

    // 🔹 Subtotal
    let subtotal = round2(
      items.reduce((sum, item) => sum + item.amount, 0)
    );

    // 🔹 Tax Calculation
    let taxAmount = 0;

    if (taxCalculationMethod === 'product') {
      items = items.map((item) => {
        const tax = round2((item.amount * item.taxRate) / 100);
        return { ...item, taxAmount: tax };
      });

      taxAmount = round2(
        items.reduce((sum, item) => sum + item.taxAmount, 0)
      );
    } else {
      const taxRate = Number(req.body.taxRate) || 0;
      taxAmount = round2((subtotal * taxRate) / 100);

      // reset item tax
      items = items.map((item) => ({
        ...item,
        taxRate: 0,
        taxAmount: 0,
      }));
    }

    // 🔹 Discount (STRICT)
    const itemDiscountSum = round2(
      items.reduce((sum, item) => sum + item.discount, 0)
    );

    const discount = round2(Number(req.body.discount) || 0);

    if (itemDiscountSum > discount) {
      return res.status(400).json({
        success: false,
        message:
          'Sum of item discounts cannot be greater than invoice discount',
      });
    }

    // 🔹 Total
    const totalAmount = round2(subtotal + taxAmount - discount);

    if (totalAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invoice total',
      });
    }

    // 🔹 Payment Logic (Simplified)
    const itemLevelPaidProvided = items.some(
      (i) => i.paidAmount && i.paidAmount > 0
    );

    let paidAmount = 0;

    if (itemLevelPaidProvided) {
      // cap per item
      items = items.map((item) => {
        const lineTotal = round2(item.amount + item.taxAmount);
        return {
          ...item,
          paidAmount: Math.min(item.paidAmount, lineTotal),
        };
      });

      const itemPaidTotal = round2(
        items.reduce((sum, i) => sum + i.paidAmount, 0)
      );

      paidAmount = Math.min(itemPaidTotal, totalAmount);
    } else {
      const requestedPaid = round2(Number(req.body.paidAmount) || 0);
      paidAmount = Math.min(requestedPaid, totalAmount);

      // distribute proportionally
      const totalLineValue = items.reduce(
        (sum, i) => sum + (i.amount + i.taxAmount),
        0
      );

      if (totalLineValue > 0) {
        items = items.map((item) => {
          const lineTotal = item.amount + item.taxAmount;
          const ratio = lineTotal / totalLineValue;

          return {
            ...item,
            paidAmount: round2(paidAmount * ratio),
          };
        });
      }
    }

    const balanceAmount = round2(totalAmount - paidAmount);

    // 🔹 Final Data
    const data = {
      ...req.body,
      items,
      taxCalculationMethod,
      subtotal,
      taxAmount,
      discount,
      totalAmount,
      paidAmount,
      balanceAmount,
      college: req.body.college || req.user.college,
      createdBy: req.user._id,
    };

    if (!data.invoiceNumber) delete data.invoiceNumber;

    const invoice = await Invoice.create(data);

    const populated = await Invoice.findById(invoice._id)
      .populate('student', 'name studentId')
      .populate('account', 'name accountType')
      .populate('college', 'name code')
      .populate('savedContent', 'name')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          'Invoice with this number already exists for this college',
      });
    }
    next(error);
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
    const normalizedSplits = normalizeAmountSplitsFromBody(req.body);
    const hasSplits = Array.isArray(normalizedSplits) && normalizedSplits.length > 0;
    const resolvedAccountId =
      accountId || invoice.account || (hasSplits ? normalizedSplits[0].account : undefined);
    let payment = null;

    if (totalPaymentAmount > 0) {
      const collegeId = invoice.college || req.user.college;
      if (!resolvedAccountId) {
        return res.status(400).json({
          success: false,
          message: 'Account is required (payment account or split account)'
        });
      }

      const payloadForAccountValidation = { account: resolvedAccountId };
      if (hasSplits) {
        payloadForAccountValidation.amountSplits = normalizedSplits;
      }
      await assertPaymentAccountsValid(payloadForAccountValidation, collegeId);

      const paymentData = {
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        amount: totalPaymentAmount,
        status: 'completed',
        account: resolvedAccountId,
        invoice: invoice._id,
        student: invoice.student,
        college: collegeId,
        notes: notes || `Invoice ${invoice.invoiceNumber || invoice._id} item payment`,
        createdBy: req.user._id
      };
      if (paymentMethod || !hasSplits) {
        paymentData.paymentMethod = paymentMethod || 'cash';
      }
      if (hasSplits) {
        paymentData.amountSplits = normalizedSplits;
      }

      payment = await Payment.create(paymentData);

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
        title: `Receipt: ${payment.paymentNumber}`,
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
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
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
        title: `Receipt: ${payment.paymentNumber}`,
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
        title: `Receipt: ${payment.paymentNumber}`,
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
  // recurring expense
  getRecurringExpenses,
  getRecurringExpenseById,
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
  getRecurringExpensePaymentHistory,
  payRecurringPayment,
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


