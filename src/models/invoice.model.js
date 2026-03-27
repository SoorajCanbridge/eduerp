const mongoose = require('mongoose');

const invoiceStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
const taxCalculationMethods = ['product', 'total'];
const invoiceItemSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  // Discount allocated to this specific item (must be <= invoice.discount total).
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  taxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      trim: true,
      uppercase: true
    },
    invoiceDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    dueDate: {
      type: Date
    },
    status: {
      type: String,
      enum: invoiceStatuses,
      default: 'draft'
    },
    billTo: {
      name: {
        type: String,
        required: true,
        trim: true
      },
      address: {
        type: String,
        trim: true
      },
      email: {
        type: String,
        trim: true,
        lowercase: true
      },
      phone: {
        type: String,
        trim: true
      },
      gstin: {
        type: String,
        trim: true
      }
    },
    items: {
      type: [invoiceItemSchema],
      required: true,
      validate: {
        validator: function(v) {
          return v && v.length > 0;
        },
        message: 'Invoice must have at least one item'
      }
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    taxCalculationMethod: {
      type: String,
      enum: taxCalculationMethods,
      default: 'total'
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    taxPaidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    balanceAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    notes: {
      type: String,
      trim: true
    },
    terms: {
      type: String,
      trim: true
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student'
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account'
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College'
    },
    savedContent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SavedInvoiceContent'
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

invoiceSchema.index({ college: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ college: 1, invoiceDate: 1 });
invoiceSchema.index({ student: 1 });
invoiceSchema.index({ account: 1 });
invoiceSchema.index({ status: 1 });

// Pre-save hook: auto-generate invoice number (per college) and calculate balance
invoiceSchema.pre('save', async function(next) {
  try {
    // Auto-generate invoice number for new invoices when not provided
    if (this.isNew && !this.invoiceNumber && this.college) {
      const lastInvoice = await this.constructor
        .findOne({ college: this.college })
        .sort({ createdAt: -1 })
        .select('invoiceNumber')
        .lean();
      const match = lastInvoice?.invoiceNumber?.match(/(\d+)$/);
      const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
      this.invoiceNumber = `INV-${String(nextNum).padStart(5, '0')}`;
    }

    // Calculate tax based on taxCalculationMethod
    if (this.items && this.items.length > 0) {
      // Calculate subtotal first
      const subtotal = this.items.reduce((sum, item) => sum + (item.amount || item.quantity * item.unitPrice), 0);
      this.subtotal = subtotal;

      if (this.taxCalculationMethod === 'product') {
        // Product-level tax: calculate tax for each item and sum them
        this.items.forEach(item => {
          // Calculate item taxAmount if taxRate is provided
          if (item.taxRate !== undefined && item.taxRate > 0) {
            item.taxAmount = (item.amount * item.taxRate) / 100;
          } else if (item.taxAmount === undefined) {
            item.taxAmount = 0;
          }
        });
        // Sum all item taxAmounts
        this.taxAmount = this.items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
      } else {
        // Total-level tax: calculate tax on subtotal
        if (this.taxRate !== undefined && this.taxRate > 0) {
          this.taxAmount = (subtotal * this.taxRate) / 100;
        } else {
          this.taxAmount = 0;
        }
        // Reset item taxAmounts for total-level tax
        this.items.forEach(item => {
          item.taxAmount = 0;
          item.taxRate = 0;
        });
      }

      // Calculate totalAmount
      const discount = this.discount || 0;
      this.totalAmount = subtotal + this.taxAmount - discount;

      // Calculate paidAmount from item-level paidAmounts + taxPaidAmount
      const itemPaidTotal = this.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
      // Only update paidAmount if it's not explicitly set or if items have been modified
      if (this.isModified('items') || this.paidAmount === undefined) {
        // For product-level tax, tax is included in item.paidAmount
        // For total-level tax, taxPaidAmount tracks tax separately
        if (this.taxCalculationMethod === 'product') {
          this.paidAmount = itemPaidTotal;
        } else {
          this.paidAmount = itemPaidTotal + (this.taxPaidAmount || 0);
        }
      }

      // Ensure item paidAmount doesn't exceed item total (amount + tax)
      this.items.forEach(item => {
        const itemTotal = (item.amount || 0) + (item.taxAmount || 0);
        if (item.paidAmount > itemTotal) {
          item.paidAmount = itemTotal;
        }
      });
      
      // Ensure taxPaidAmount doesn't exceed taxAmount (for total-level tax)
      if (this.taxCalculationMethod === 'total' && this.taxPaidAmount > this.taxAmount) {
        this.taxPaidAmount = this.taxAmount;
      }
      
      // Recalculate paidAmount after validation; cap at totalAmount so balance never negative
      const itemSumPaid = this.items.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
      if (this.taxCalculationMethod === 'product') {
        this.paidAmount = Math.min(itemSumPaid, this.totalAmount);
      } else {
        this.paidAmount = Math.min(itemSumPaid + (this.taxPaidAmount || 0), this.totalAmount);
      }
    }

    this.balanceAmount = this.totalAmount - this.paidAmount;
    if (this.balanceAmount <= 0 && this.status === 'sent') {
      this.status = 'paid';
    } else if (
      this.dueDate &&
      this.balanceAmount > 0 &&
      new Date() > this.dueDate &&
      this.status === 'sent'
    ) {
      this.status = 'overdue';
    }
    // next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Invoice', invoiceSchema);

