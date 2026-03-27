const express = require('express');
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const {
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
} = require('../controllers/finance.controller');

const router = express.Router();

const categoryTypes = ['income', 'expense', 'both'];
const paymentMethods = ['cash', 'bank-transfer', 'upi', 'cheque', 'card', 'other'];
const paymentMethodsWithMixed = [...paymentMethods, 'mixed'];
const invoiceStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
const taxCalculationMethods = ['product', 'total'];
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
const accountStatuses = ['active', 'inactive', 'closed'];
const transactionTypes = ['debit', 'credit'];
const entryTypes = ['income', 'expense', 'transfer', 'payment', 'invoice', 'adjustment', 'opening'];
const paymentStatuses = ['pending', 'completed', 'failed', 'cancelled', 'refunded'];

// auth for all finance routes
router.use(auth);

// CATEGORY validators
const categoryCreateValidators = [
  body('name')
    .isLength({ min: 2 })
    .withMessage('Category name must be at least 2 characters long')
    .trim(),
  body('type')
    .isIn(categoryTypes)
    .withMessage('Category type must be one of income, expense, both'),
  body('description')
    .optional()
    .trim(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID')
];

const categoryUpdateValidators = [
  body('name')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Category name must be at least 2 characters long')
    .trim(),
  body('type')
    .optional()
    .isIn(categoryTypes)
    .withMessage('Category type must be one of income, expense, both'),
  body('description')
    .optional()
    .trim(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// INCOME validators
const incomeCreateValidators = [
  body('title')
    .isLength({ min: 2 })
    .withMessage('Title must be at least 2 characters long')
    .trim(),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date'),
  body('category')
    .isMongoId()
    .withMessage('Category must be a valid Mongo ID'),
  body('account')
    .isMongoId()
    .withMessage('Account must be a valid Mongo ID'),
  body('student')
    .optional()
    .isMongoId()
    .withMessage('Student must be a valid Mongo ID'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID'),
  body('referenceNumber')
    .optional()
    .trim(),
  body('recipient')
    .optional()
    .isObject()
    .withMessage('recipient must be an object'),
  body('recipient.name')
    .optional()
    .trim(),
  body('recipient.phone')
    .optional()
    .trim(),
  body('recipient.email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('recipient email must be valid'),
  body('recipient.address')
    .optional()
    .trim(),
  body('notes')
    .optional()
    .trim(),
  body('files')
    .optional()
    .isArray()
    .withMessage('files must be an array of path strings'),
  body('files.*')
    .optional()
    .trim()
    .isString()
    .withMessage('Each file must be a path string'),
  body('isCancelled')
    .optional()
    .isBoolean()
    .withMessage('isCancelled must be a boolean')
];

const incomeUpdateValidators = [
  body('title')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Title must be at least 2 characters long')
    .trim(),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date'),
  body('category')
    .optional()
    .isMongoId()
    .withMessage('Category must be a valid Mongo ID'),
  body('account')
    .optional()
    .isMongoId()
    .withMessage('Account must be a valid Mongo ID'),
  body('student')
    .optional()
    .isMongoId()
    .withMessage('Student must be a valid Mongo ID'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID'),
  body('referenceNumber')
    .optional()
    .trim(),
  body('recipient')
    .optional()
    .isObject()
    .withMessage('recipient must be an object'),
  body('recipient.name')
    .optional()
    .trim(),
  body('recipient.phone')
    .optional()
    .trim(),
  body('recipient.email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('recipient email must be valid'),
  body('recipient.address')
    .optional()
    .trim(),
  body('notes')
    .optional()
    .trim(),
  body('files')
    .optional()
    .isArray()
    .withMessage('files must be an array of path strings'),
  body('files.*')
    .optional()
    .trim()
    .isString()
    .withMessage('Each file must be a path string'),
  body('isCancelled')
    .optional()
    .isBoolean()
    .withMessage('isCancelled must be a boolean')
];

// EXPENSE validators
const expenseCreateValidators = [
  body('title')
    .isLength({ min: 2 })
    .withMessage('Title must be at least 2 characters long')
    .trim(),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date'),
  body('category')
    .isMongoId()
    .withMessage('Category must be a valid Mongo ID'),
  body('account')
    .isMongoId()
    .withMessage('Account must be a valid Mongo ID'),
  body('vendor')
    .optional()
    .trim(),
  body('recipient')
    .optional()
    .isObject()
    .withMessage('recipient must be an object'),
  body('recipient.name')
    .optional()
    .trim(),
  body('recipient.phone')
    .optional()
    .trim(),
  body('recipient.email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('recipient email must be valid'),
  body('recipient.address')
    .optional()
    .trim(),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID'),
  body('referenceNumber')
    .optional()
    .trim(),
  body('notes')
    .optional()
    .trim(),
  body('files')
    .optional()
    .isArray()
    .withMessage('files must be an array of path strings'),
  body('files.*')
    .optional()
    .trim()
    .isString()
    .withMessage('Each file must be a path string'),
  body('isCancelled')
    .optional()
    .isBoolean()
    .withMessage('isCancelled must be a boolean')
];

const expenseUpdateValidators = [
  body('title')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Title must be at least 2 characters long')
    .trim(),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date'),
  body('category')
    .optional()
    .isMongoId()
    .withMessage('Category must be a valid Mongo ID'),
  body('account')
    .optional()
    .isMongoId()
    .withMessage('Account must be a valid Mongo ID'),
  body('vendor')
    .optional()
    .trim(),
  body('recipient')
    .optional()
    .isObject()
    .withMessage('recipient must be an object'),
  body('recipient.name')
    .optional()
    .trim(),
  body('recipient.phone')
    .optional()
    .trim(),
  body('recipient.email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('recipient email must be valid'),
  body('recipient.address')
    .optional()
    .trim(),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID'),
  body('referenceNumber')
    .optional()
    .trim(),
  body('notes')
    .optional()
    .trim(),
  body('files')
    .optional()
    .isArray()
    .withMessage('files must be an array of path strings'),
  body('files.*')
    .optional()
    .trim()
    .isString()
    .withMessage('Each file must be a path string'),
  body('isCancelled')
    .optional()
    .isBoolean()
    .withMessage('isCancelled must be a boolean')
];

// CATEGORY routes
router.get('/categories', requirePermission('finance', 'view'), getCategories);
router.get('/categories/:id', requirePermission('finance', 'view'), getCategoryById);
router.post(
  '/categories',
  requirePermission('finance', 'edit'),
  categoryCreateValidators,
  createCategory
);
router.put(
  '/categories/:id',
  requirePermission('finance', 'edit'),
  categoryUpdateValidators,
  updateCategory
);
router.delete(
  '/categories/:id',
  requirePermission('finance', 'edit'),
  deleteCategory
);

// INCOME routes
router.get('/incomes', requirePermission('finance', 'view'), getIncomes);
router.get('/incomes/:id', requirePermission('finance', 'view'), getIncomeById);
router.post(
  '/incomes',
  requirePermission('finance', 'edit'),
  incomeCreateValidators,
  createIncome
);
router.put(
  '/incomes/:id',
  requirePermission('finance', 'edit'),
  incomeUpdateValidators,
  updateIncome
);
router.delete(
  '/incomes/:id',
  requirePermission('finance', 'edit'),
  deleteIncome
);

// EXPENSE routes
router.get('/expenses', requirePermission('finance', 'view'), getExpenses);
router.get(
  '/expenses/:id',
  requirePermission('finance', 'view'),
  getExpenseById
);
router.post(
  '/expenses',
  requirePermission('finance', 'edit'),
  expenseCreateValidators,
  createExpense
);
router.put(
  '/expenses/:id',
  requirePermission('finance', 'edit'),
  expenseUpdateValidators,
  updateExpense
);
router.delete(
  '/expenses/:id',
  requirePermission('finance', 'edit'),
  deleteExpense
);

// SUMMARY
router.get('/summary', requirePermission('finance', 'view'), getFinanceSummary);

// INVOICE validators
const invoiceCreateValidators = [
  // body('invoiceNumber')
  //   .optional()
  //   .isLength({ min: 1 })
  //   .withMessage('Invoice number cannot be empty when provided')
  //   .trim(),
  body('invoiceDate')
    .optional()
    .isISO8601()
    .withMessage('Invoice date must be a valid ISO date'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid ISO date when provided'),
  body('status')
    .optional()
    .isIn(invoiceStatuses)
    .withMessage('Status must be a valid invoice status'),
  body('billTo.name')
    .isLength({ min: 2 })
    .withMessage('Bill to name must be at least 2 characters long')
    .trim(),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array'),
  body('items.*.description')
    .isLength({ min: 1 })
    .withMessage('Item description is required')
    .trim(),
  body('items.*.quantity')
    .isFloat({ min: 0 })
    .withMessage('Item quantity must be a positive number'),
  body('items.*.unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Item unit price must be a positive number'),
  body('items.*.taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Item tax rate must be between 0 and 100'),
  body('items.*.taxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item tax amount must be a positive number'),
  body('items.*.paidAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item paid amount must be a positive number'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item discount must be a positive number'),
  body('taxCalculationMethod')
    .optional()
    .isIn(taxCalculationMethods)
    .withMessage('Tax calculation method must be either "product" or "total"'),
  body('taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax rate must be between 0 and 100'),
  body('discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('student')
    .optional()
    .isMongoId()
    .withMessage('Student must be a valid Mongo ID'),
  body('account')
    .optional()
    .isMongoId()
    .withMessage('Account must be a valid Mongo ID'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID')
];

const invoiceUpdateValidators = [
  body('invoiceNumber')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Invoice number cannot be empty')
    .trim(),
  body('invoiceDate')
    .optional()
    .isISO8601()
    .withMessage('Invoice date must be a valid ISO date'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid ISO date'),
  body('status')
    .optional()
    .isIn(invoiceStatuses)
    .withMessage('Status must be a valid invoice status'),
  body('items')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array'),
  body('items.*.taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Item tax rate must be between 0 and 100'),
  body('items.*.taxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item tax amount must be a positive number'),
  body('items.*.paidAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item paid amount must be a positive number'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item discount must be a positive number'),
  body('taxCalculationMethod')
    .optional()
    .isIn(taxCalculationMethods)
    .withMessage('Tax calculation method must be either "product" or "total"'),
  body('taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax rate must be between 0 and 100'),
  body('discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('paidAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Paid amount must be a positive number')
];

const payInvoiceItemsValidators = [
  body('itemPayments')
    .isArray({ min: 1 })
    .withMessage('itemPayments must be a non-empty array'),
  body('itemPayments.*.itemIndex')
    .isInt({ min: 0 })
    .withMessage('itemIndex must be a non-negative integer'),
  body('itemPayments.*.amount')
    .isFloat({ min: 0 })
    .withMessage('Payment amount must be a positive number'),
  body('account')
    .optional()
    .isMongoId()
    .withMessage('Account must be a valid Mongo ID when recording payment'),
  body('paymentDate')
    .optional()
    .isISO8601()
    .withMessage('Payment date must be a valid ISO date'),
  body('paymentMethod')
    .optional()
    .isIn(paymentMethods)
    .withMessage('Payment method must be a valid method'),
  body('notes')
    .optional()
    .trim()
];

const applyInvoiceItemDiscountsValidators = [
  body('discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('discount must be a non-negative number'),
  body('itemDiscounts')
    .isArray({ min: 1 })
    .withMessage('itemDiscounts must be a non-empty array'),
  body('itemDiscounts.*.itemIndex')
    .isInt({ min: 0 })
    .withMessage('itemIndex must be a non-negative integer'),
  body('itemDiscounts.*.discount')
    .isFloat({ min: 0 })
    .withMessage('Item discount must be a non-negative number')
];

// SAVED INVOICE CONTENT validators
const savedInvoiceContentCreateValidators = [
  body('name')
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long')
    .trim(),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array'),
  body('items.*.description')
    .isLength({ min: 1 })
    .withMessage('Item description is required')
    .trim(),
  body('items.*.quantity')
    .isFloat({ min: 0 })
    .withMessage('Item quantity must be a positive number'),
  body('items.*.unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Item unit price must be a positive number'),
  body('items.*.taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Item tax rate must be between 0 and 100'),
  body('items.*.taxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item tax amount must be a positive number'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item discount must be a positive number'),
  body('taxCalculationMethod')
    .optional()
    .isIn(taxCalculationMethods)
    .withMessage('Tax calculation method must be either "product" or "total"'),
  body('taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax rate must be between 0 and 100'),
  body('discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID')
];

const savedInvoiceContentUpdateValidators = [
  body('name')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long')
    .trim(),
  body('items')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array'),
  body('items.*.taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Item tax rate must be between 0 and 100'),
  body('items.*.taxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item tax amount must be a positive number'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item discount must be a positive number'),
  body('taxCalculationMethod')
    .optional()
    .isIn(taxCalculationMethods)
    .withMessage('Tax calculation method must be either "product" or "total"'),
  body('taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax rate must be between 0 and 100'),
  body('discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// ACCOUNT validators
const accountCreateValidators = [
  body('name')
    .isLength({ min: 2 })
    .withMessage('Account name must be at least 2 characters long')
    .trim(),
  body('accountType')
    .isIn(accountTypes)
    .withMessage('Account type must be a valid type'),
  body('balance')
    .optional()
    .isFloat()
    .withMessage('Balance must be a number'),
  body('status')
    .optional()
    .isIn(accountStatuses)
    .withMessage('Status must be a valid account status'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID')
];

const accountUpdateValidators = [
  body('name')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Account name must be at least 2 characters long')
    .trim(),
  body('accountType')
    .optional()
    .isIn(accountTypes)
    .withMessage('Account type must be a valid type'),
  body('balance')
    .optional()
    .isFloat()
    .withMessage('Balance must be a number'),
  body('status')
    .optional()
    .isIn(accountStatuses)
    .withMessage('Status must be a valid account status'),
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be a boolean')
];

// LEDGER validators (ledger has lines[] per account; no single account field)
const ledgerCreateValidators = [
  body('entryDate')
    .optional()
    .isISO8601()
    .withMessage('Entry date must be a valid ISO date'),
  body('entryType')
    .isIn(entryTypes)
    .withMessage('Entry type must be a valid type'),
  body('lines')
    .isArray({ min: 1 })
    .withMessage('At least one line is required'),
  body('lines.*.account')
    .isMongoId()
    .withMessage('Each line must have a valid account ID'),
  body('lines.*.transactionType')
    .isIn(transactionTypes)
    .withMessage('Each line transaction type must be debit or credit'),
  body('lines.*.amount')
    .isFloat({ min: 0 })
    .withMessage('Each line amount must be a positive number'),
  body('description')
    .isLength({ min: 2 })
    .withMessage('Description must be at least 2 characters long')
    .trim(),
  body('category')
    .optional()
    .isMongoId()
    .withMessage('Category must be a valid Mongo ID'),
  body('student')
    .optional()
    .isMongoId()
    .withMessage('Student must be a valid Mongo ID'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID')
];

const ledgerUpdateValidators = [
  body('entryDate')
    .optional()
    .isISO8601()
    .withMessage('Entry date must be a valid ISO date'),
  body('entryType')
    .optional()
    .isIn(entryTypes)
    .withMessage('Entry type must be a valid type'),
  body('lines')
    .optional()
    .isArray({ min: 1 })
    .withMessage('If provided, lines must have at least one entry'),
  body('lines.*.account')
    .optional()
    .isMongoId()
    .withMessage('Each line must have a valid account ID'),
  body('lines.*.transactionType')
    .optional()
    .isIn(transactionTypes)
    .withMessage('Each line transaction type must be debit or credit'),
  body('lines.*.amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Each line amount must be a positive number'),
  body('description')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Description must be at least 2 characters long')
    .trim()
];

// PAYMENT validators
/** Map `accountSplits` → `amountSplits` so one validator set covers both client naming styles. */
const aliasPaymentSplitsPayload = (req, res, next) => {
  if (req.body && !req.body.amountSplits && Array.isArray(req.body.accountSplits)) {
    req.body.amountSplits = req.body.accountSplits;
  }
  next();
};

const paymentMethodBodyValidatorCreate = (value, { req }) => {
  const splits = req.body.amountSplits || req.body.accountSplits;
  const hasSplits = Array.isArray(splits) && splits.length > 0;
  if (!hasSplits) {
    if (value == null || value === '') {
      throw new Error('paymentMethod is required when amountSplits is not used');
    }
    if (!paymentMethods.includes(value)) {
      throw new Error('Payment method must be a valid method');
    }
  } else if (value != null && value !== '' && !paymentMethodsWithMixed.includes(value)) {
    throw new Error('Payment method must be a valid method');
  }
  return true;
};

/** Same as create, but paymentMethod is optional when not sending amountSplits (partial updates). */
const paymentMethodBodyValidatorUpdate = (value, { req }) => {
  const splits = req.body.amountSplits || req.body.accountSplits;
  const hasSplits = Array.isArray(splits) && splits.length > 0;
  if (!hasSplits) {
    if (value == null || value === '') {
      return true;
    }
    if (!paymentMethods.includes(value)) {
      throw new Error('Payment method must be a valid method');
    }
  } else if (value != null && value !== '' && !paymentMethodsWithMixed.includes(value)) {
    throw new Error('Payment method must be a valid method');
  }
  return true;
};

const paymentCreateValidators = [
  body('paymentNumber')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Payment number cannot be empty when provided')
    .trim(),
  body('paymentDate')
    .optional()
    .isISO8601()
    .withMessage('Payment date must be a valid ISO date'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('paymentMethod').custom(paymentMethodBodyValidatorCreate),
  body('amountSplits')
    .optional()
    .isArray()
    .withMessage('amountSplits must be an array'),
  body('amountSplits.*.amount')
    .if(body('amountSplits').isArray({ min: 1 }))
    .isFloat({ min: 0 })
    .withMessage('Each split amount must be a non-negative number'),
  body('amountSplits.*.paymentMethod')
    .if(body('amountSplits').isArray({ min: 1 }))
    .optional()
    .isIn(paymentMethods)
    .withMessage('Each split must have a valid payment method when provided'),
  body('amountSplits.*.account')
    .optional()
    .isMongoId()
    .withMessage('Each split account must be a valid Mongo ID'),
  body('amountSplits.*.accountId')
    .optional()
    .isMongoId()
    .withMessage('Each split accountId must be a valid Mongo ID'),
  body('accountSplits')
    .optional()
    .isArray()
    .withMessage('accountSplits must be an array'),
  body('accountSplits.*.amount')
    .if(body('accountSplits').isArray({ min: 1 }))
    .isFloat({ min: 0 })
    .withMessage('Each account split amount must be a non-negative number'),
  body('accountSplits.*.paymentMethod')
    .if(body('accountSplits').isArray({ min: 1 }))
    .optional()
    .isIn(paymentMethods)
    .withMessage('Each account split must have a valid payment method when provided'),
  body('accountSplits.*.account')
    .optional()
    .isMongoId()
    .withMessage('Each account split account must be a valid Mongo ID'),
  body('accountSplits.*.accountId')
    .optional()
    .isMongoId()
    .withMessage('Each account split accountId must be a valid Mongo ID'),
  body('status')
    .optional()
    .isIn(paymentStatuses)
    .withMessage('Status must be a valid payment status'),
  body('account')
    .isMongoId()
    .withMessage('Account must be a valid Mongo ID'),
  body('invoice')
    .optional()
    .isMongoId()
    .withMessage('Invoice must be a valid Mongo ID'),
  body('student')
    .optional()
    .isMongoId()
    .withMessage('Student must be a valid Mongo ID'),
  body('college')
    .optional()
    .isMongoId()
    .withMessage('College must be a valid Mongo ID'),
  body('chequeDate')
    .optional()
    .isISO8601()
    .withMessage('Cheque date must be a valid ISO date')
];

const paymentUpdateValidators = [
  body('paymentNumber')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Payment number cannot be empty')
    .trim(),
  body('paymentDate')
    .optional()
    .isISO8601()
    .withMessage('Payment date must be a valid ISO date'),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('paymentMethod').optional().custom(paymentMethodBodyValidatorUpdate),
  body('amountSplits')
    .optional()
    .isArray()
    .withMessage('amountSplits must be an array'),
  body('amountSplits.*.amount')
    .if(body('amountSplits').isArray({ min: 1 }))
    .isFloat({ min: 0 })
    .withMessage('Each split amount must be a non-negative number'),
  body('amountSplits.*.paymentMethod')
    .if(body('amountSplits').isArray({ min: 1 }))
    .optional()
    .isIn(paymentMethods)
    .withMessage('Each split must have a valid payment method when provided'),
  body('amountSplits.*.account')
    .optional()
    .isMongoId()
    .withMessage('Each split account must be a valid Mongo ID'),
  body('amountSplits.*.accountId')
    .optional()
    .isMongoId()
    .withMessage('Each split accountId must be a valid Mongo ID'),
  body('accountSplits')
    .optional()
    .isArray()
    .withMessage('accountSplits must be an array'),
  body('accountSplits.*.amount')
    .if(body('accountSplits').isArray({ min: 1 }))
    .isFloat({ min: 0 })
    .withMessage('Each account split amount must be a non-negative number'),
  body('accountSplits.*.paymentMethod')
    .if(body('accountSplits').isArray({ min: 1 }))
    .optional()
    .isIn(paymentMethods)
    .withMessage('Each account split must have a valid payment method when provided'),
  body('accountSplits.*.account')
    .optional()
    .isMongoId()
    .withMessage('Each account split account must be a valid Mongo ID'),
  body('accountSplits.*.accountId')
    .optional()
    .isMongoId()
    .withMessage('Each account split accountId must be a valid Mongo ID'),
  body('status')
    .optional()
    .isIn(paymentStatuses)
    .withMessage('Status must be a valid payment status'),
  body('account')
    .optional()
    .isMongoId()
    .withMessage('Account must be a valid Mongo ID'),
  body('invoice')
    .optional()
    .isMongoId()
    .withMessage('Invoice must be a valid Mongo ID'),
  body('chequeDate')
    .optional()
    .isISO8601()
    .withMessage('Cheque date must be a valid ISO date')
];

// INVOICE routes
router.get('/invoices', requirePermission('invoice', 'view'), getInvoices);
router.get(
  '/invoices/:id',
  requirePermission('invoice', 'view'),
  getInvoiceById
);
router.post(
  '/invoices',
  requirePermission('invoice', 'edit'),
  invoiceCreateValidators,
  createInvoice
);
router.put(
  '/invoices/:id',
  requirePermission('invoice', 'edit'),
  invoiceUpdateValidators,
  updateInvoice
);
router.delete(
  '/invoices/:id',
  requirePermission('invoice', 'edit'),
  deleteInvoice
);
router.post(
  '/invoices/:id/pay-items',
  requirePermission('invoice', 'edit'),
  payInvoiceItemsValidators,
  payInvoiceItems
);
router.put(
  '/invoices/:id/apply-item-discounts',
  requirePermission('invoice', 'edit'),
  applyInvoiceItemDiscountsValidators,
  applyInvoiceItemDiscounts
);

// SAVED INVOICE CONTENT routes
router.get(
  '/saved-invoice-contents',
  requirePermission('fees', 'view'),
  getSavedInvoiceContents
);
router.get(
  '/saved-invoice-contents/:id',
  requirePermission('fees', 'view'),
  getSavedInvoiceContentById
);
router.post(
  '/saved-invoice-contents',
  requirePermission('fees', 'edit'),
  savedInvoiceContentCreateValidators,
  createSavedInvoiceContent
);
router.put(
  '/saved-invoice-contents/:id',
  requirePermission('fees', 'edit'),
  savedInvoiceContentUpdateValidators,
  updateSavedInvoiceContent
);
router.delete(
  '/saved-invoice-contents/:id',
  requirePermission('fees', 'edit'),
  deleteSavedInvoiceContent
);

// ACCOUNT routes (specific path before :id so /accounts/:id/ledgers is matched)
router.get('/accounts', requirePermission('finance', 'view'), getAccounts);
router.get(
  '/accounts/:id/ledgers',
  requirePermission('finance', 'view'),
  getAccountLedgers
);
router.get(
  '/accounts/:id',
  requirePermission('finance', 'view'),
  getAccountById
);
router.post(
  '/accounts',
  requirePermission('finance', 'edit'),
  accountCreateValidators,
  createAccount
);
router.put(
  '/accounts/:id',
  requirePermission('finance', 'edit'),
  accountUpdateValidators,
  updateAccount
);
router.delete(
  '/accounts/:id',
  requirePermission('finance', 'edit'),
  deleteAccount
);

// LEDGER routes
router.get('/ledgers', requirePermission('finance', 'view'), getLedgers);
router.get(
  '/ledgers/:id',
  requirePermission('finance', 'view'),
  getLedgerById
);
router.post(
  '/ledgers',
  requirePermission('finance', 'edit'),
  ledgerCreateValidators,
  createLedger
);
router.put(
  '/ledgers/:id',
  requirePermission('finance', 'edit'),
  ledgerUpdateValidators,
  updateLedger
);
router.delete(
  '/ledgers/:id',
  requirePermission('finance', 'edit'),
  deleteLedger
);

// PAYMENT routes
router.get('/payments', requirePermission('payments', 'view'), getPayments);
router.get(
  '/payments/:id',
  requirePermission('payments', 'view'),
  getPaymentById
);
router.post(
  '/payments',
  requirePermission('payments', 'edit'),
  aliasPaymentSplitsPayload,
  paymentCreateValidators,
  createPayment
);
router.put(
  '/payments/:id',
  requirePermission('payments', 'edit'),
  aliasPaymentSplitsPayload,
  paymentUpdateValidators,
  updatePayment
);
router.delete(
  '/payments/:id',
  requirePermission('payments', 'edit'),
  deletePayment
);

module.exports = router;


