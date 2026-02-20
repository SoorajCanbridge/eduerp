const express = require('express');
const { body } = require('express-validator');
const auth = require('../middleware/auth');
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
const invoiceStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
const taxCalculationMethods = ['product', 'total'];
const accountTypes = ['bank', 'cash', 'credit-card', 'savings', 'current', 'other'];
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
  body('notes')
    .optional()
    .trim(),
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
  body('notes')
    .optional()
    .trim(),
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
  body('isCancelled')
    .optional()
    .isBoolean()
    .withMessage('isCancelled must be a boolean')
];

// CATEGORY routes
router.get('/categories', getCategories);
router.get('/categories/:id', getCategoryById);
router.post('/categories', categoryCreateValidators, createCategory);
router.put('/categories/:id', categoryUpdateValidators, updateCategory);
router.delete('/categories/:id', deleteCategory);

// INCOME routes
router.get('/incomes', getIncomes);
router.get('/incomes/:id', getIncomeById);
router.post('/incomes', incomeCreateValidators, createIncome);
router.put('/incomes/:id', incomeUpdateValidators, updateIncome);
router.delete('/incomes/:id', deleteIncome);

// EXPENSE routes
router.get('/expenses', getExpenses);
router.get('/expenses/:id', getExpenseById);
router.post('/expenses', expenseCreateValidators, createExpense);
router.put('/expenses/:id', expenseUpdateValidators, updateExpense);
router.delete('/expenses/:id', deleteExpense);

// SUMMARY
router.get('/summary', getFinanceSummary);

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
    .withMessage('Payment amount must be a positive number')
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
  body('paymentMethod')
    .isIn(paymentMethods)
    .withMessage('Payment method must be a valid method'),
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
  body('paymentMethod')
    .optional()
    .isIn(paymentMethods)
    .withMessage('Payment method must be a valid method'),
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
router.get('/invoices', getInvoices);
router.get('/invoices/:id', getInvoiceById);
router.post('/invoices', invoiceCreateValidators, createInvoice);
router.put('/invoices/:id', invoiceUpdateValidators, updateInvoice);
router.delete('/invoices/:id', deleteInvoice);
router.post('/invoices/:id/pay-items', payInvoiceItemsValidators, payInvoiceItems);

// SAVED INVOICE CONTENT routes
router.get('/saved-invoice-contents', getSavedInvoiceContents);
router.get('/saved-invoice-contents/:id', getSavedInvoiceContentById);
router.post('/saved-invoice-contents', savedInvoiceContentCreateValidators, createSavedInvoiceContent);
router.put('/saved-invoice-contents/:id', savedInvoiceContentUpdateValidators, updateSavedInvoiceContent);
router.delete('/saved-invoice-contents/:id', deleteSavedInvoiceContent);

// ACCOUNT routes (specific path before :id so /accounts/:id/ledgers is matched)
router.get('/accounts', getAccounts);
router.get('/accounts/:id/ledgers', getAccountLedgers);
router.get('/accounts/:id', getAccountById);
router.post('/accounts', accountCreateValidators, createAccount);
router.put('/accounts/:id', accountUpdateValidators, updateAccount);
router.delete('/accounts/:id', deleteAccount);

// LEDGER routes
router.get('/ledgers', getLedgers);
router.get('/ledgers/:id', getLedgerById);
router.post('/ledgers', ledgerCreateValidators, createLedger);
router.put('/ledgers/:id', ledgerUpdateValidators, updateLedger);
router.delete('/ledgers/:id', deleteLedger);

// PAYMENT routes
router.get('/payments', getPayments);
router.get('/payments/:id', getPaymentById);
router.post('/payments', paymentCreateValidators, createPayment);
router.put('/payments/:id', paymentUpdateValidators, updatePayment);
router.delete('/payments/:id', deletePayment);

module.exports = router;


