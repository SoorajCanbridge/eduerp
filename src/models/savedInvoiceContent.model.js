const mongoose = require('mongoose');

const taxCalculationMethods = ['product', 'total'];

const savedInvoiceItemSchema = new mongoose.Schema({
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
  }
}, { _id: false });

const savedInvoiceContentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    items: {
      type: [savedInvoiceItemSchema],
      required: true,
      validate: {
        validator: function(v) {
          return v && v.length > 0;
        },
        message: 'Saved invoice content must have at least one item'
      }
    },
    taxCalculationMethod: {
      type: String,
      enum: taxCalculationMethods,
      default: 'total'
    },
    subtotal: {
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
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
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
    isActive: {
      type: Boolean,
      default: true
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

savedInvoiceContentSchema.index({ college: 1, name: 1 }, { unique: true });
savedInvoiceContentSchema.index({ college: 1, isActive: 1 });

module.exports = mongoose.model('SavedInvoiceContent', savedInvoiceContentSchema);

