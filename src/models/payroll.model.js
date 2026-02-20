const mongoose = require('mongoose');

const payrollStatuses = ['draft', 'pending', 'approved', 'paid', 'cancelled', 'on-hold', 'reversed'];
const paymentMethods = ['cash', 'bank-transfer', 'upi', 'cheque', 'other', 'neft', 'rtgs', 'imps'];
const itemCategories = {
  allowance: ['hra', 'transport', 'medical', 'special', 'performance', 'overtime', 'bonus', 'incentive', 'arrears', 'reimbursement', 'leave-encashment', 'other'],
  deduction: ['income-tax', 'provident-fund', 'professional-tax', 'esi', 'loan', 'advance', 'insurance', 'other']
};

const payrollItemSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['allowance', 'deduction'],
    required: true
  },
  category: {
    type: String,
    enum: itemCategories[this.type],
    trim: true
  },
  isTaxable: {
    type: Boolean,
    default: true
  },
  isExempted: {
    type: Boolean,
    default: false
  },
  exemptionLimit: {
    type: Number,
    default: 0
  },
  reference: {
    type: String,
    trim: true
  },
  applicableFrom: {
    type: Date
  },
  applicableTo: {
    type: Date
  }
}, { _id: false });

const payrollSchema = new mongoose.Schema(
  {
    payrollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    year: {
      type: Number,
      required: true,
      min: 2000
    },
    periodStart: {
      type: Date,
      required: true
    },
    periodEnd: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: payrollStatuses,
      default: 'draft'
    },
    // Attendance summary
    totalDays: {
      type: Number,
      default: 0,
      min: 0
    },
    presentDays: {
      type: Number,
      default: 0,
      min: 0
    },
    absentDays: {
      type: Number,
      default: 0,
      min: 0
    },
    leaveDays: {
      type: Number,
      default: 0,
      min: 0
    },
    halfDays: {
      type: Number,
      default: 0,
      min: 0
    },
    workingHours: {
      type: Number,
      default: 0,
      min: 0
    },
    // Overtime details
    overtimeHours: {
      type: Number,
      default: 0,
      min: 0
    },
    overtimeRate: {
      type: Number,
      default: 0,
      min: 0
    },
    overtimeAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    // Salary details
    baseSalary: {
      type: Number,
      required: true,
      min: 0
    },
    items: {
      type: [payrollItemSchema],
      default: []
    },
    // Tax and statutory deductions
    taxDetails: {
      taxableIncome: {
        type: Number,
        default: 0,
        min: 0
      },
      incomeTax: {
        type: Number,
        default: 0,
        min: 0
      },
      tds: {
        type: Number,
        default: 0,
        min: 0
      },
      providentFund: {
        employee: {
          type: Number,
          default: 0,
          min: 0
        },
        employer: {
          type: Number,
          default: 0,
          min: 0
        },
        total: {
          type: Number,
          default: 0,
          min: 0
        }
      },
      esi: {
        employee: {
          type: Number,
          default: 0,
          min: 0
        },
        employer: {
          type: Number,
          default: 0,
          min: 0
        },
        total: {
          type: Number,
          default: 0,
          min: 0
        }
      },
      professionalTax: {
        type: Number,
        default: 0,
        min: 0
      },
      otherTaxes: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    // Loan and advance deductions
    loanDeductions: [{
      // loanId: {
      //   type: mongoose.Schema.Types.ObjectId,
      //   ref: 'Loan'
      // },
      description: {
        type: String,
        trim: true
      },
      principal: {
        type: Number,
        default: 0,
        min: 0
      },
      interest: {
        type: Number,
        default: 0,
        min: 0
      },
      total: {
        type: Number,
        default: 0,
        min: 0
      }
    }],
    advanceDeductions: [{
      // advanceId: {
      //   type: mongoose.Schema.Types.ObjectId,
      //   ref: 'Advance'
      // },
      description: {
        type: String,
        trim: true
      },
      amount: {
        type: Number,
        default: 0,
        min: 0
      }
    }],
    // Reimbursements
    reimbursements: [{
      type: {
        type: String,
        enum: ['travel', 'medical', 'meal', 'communication', 'other'],
        required: true
      },
      description: {
        type: String,
        trim: true
      },
      amount: {
        type: Number,
        required: true,
        min: 0
      },
      receiptNumber: {
        type: String,
        trim: true
      },
      receiptDate: {
        type: Date
      }
    }],
    // Leave encashment
    leaveEncashment: {
      eligibleDays: {
        type: Number,
        default: 0,
        min: 0
      },
      encashedDays: {
        type: Number,
        default: 0,
        min: 0
      },
      ratePerDay: {
        type: Number,
        default: 0,
        min: 0
      },
      amount: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    // Bonus and incentives
    bonus: {
      type: Number,
      default: 0,
      min: 0
    },
    incentives: {
      type: Number,
      default: 0,
      min: 0
    },
    // Arrears
    arrears: {
      amount: {
        type: Number,
        default: 0,
        min: 0
      },
      fromPeriod: {
        month: Number,
        year: Number
      },
      toPeriod: {
        month: Number,
        year: Number
      },
      reason: {
        type: String,
        trim: true
      }
    },
    // Calculations
    totalAllowances: {
      type: Number,
      default: 0,
      min: 0
    },
    totalDeductions: {
      type: Number,
      default: 0,
      min: 0
    },
    grossSalary: {
      type: Number,
      min: 0
    },
    netSalary: {
      type: Number,
      min: 0
    },
    // Year-to-date (YTD) calculations
    ytdGrossSalary: {
      type: Number,
      default: 0,
      min: 0
    },
    ytdNetSalary: {
      type: Number,
      default: 0,
      min: 0
    },
    ytdTaxDeducted: {
      type: Number,
      default: 0,
      min: 0
    },
    // Payment details
    paymentDate: {
      type: Date
    },
    paymentMethod: {
      type: String,
      enum: paymentMethods
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account'
    },
    transactionReference: {
      type: String,
      trim: true
    },
    // Payment splits/installments
    paymentSplits: [{
      amount: {
        type: Number,
        required: true,
        min: 0
      },
      paymentDate: {
        type: Date,
        required: true
      },
      paymentMethod: {
        type: String,
        enum: paymentMethods
      },
      account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account'
      },
      transactionReference: {
        type: String,
        trim: true
      },
      status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'cancelled'],
        default: 'pending'
      },
      paidAt: {
        type: Date
      }
    }],
    // Salary on hold
    isOnHold: {
      type: Boolean,
      default: false
    },
    holdReason: {
      type: String,
      trim: true
    },
    holdFrom: {
      type: Date
    },
    holdTo: {
      type: Date
    },
    // Approval workflow
    approvalWorkflow: [{
      level: {
        type: Number,
        required: true
      },
      approver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
      },
      comments: {
        type: String,
        trim: true
      },
      approvedAt: {
        type: Date
      },
      rejectedAt: {
        type: Date
      }
    }],
    currentApprovalLevel: {
      type: Number,
      default: 0
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rejectedAt: {
      type: Date
    },
    rejectionReason: {
      type: String,
      trim: true
    },
    // Finance integration
    expense: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense'
    },
    ledger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ledger'
    },
    // Reversal tracking
    isReversed: {
      type: Boolean,
      default: false
    },
    reversedAt: {
      type: Date
    },
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reversalReason: {
      type: String,
      trim: true
    },
    originalPayroll: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payroll'
    },
    reversalPayroll: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payroll'
    },
    // Cost center and department allocation
    costCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CostCenter'
    },
    // Pay slip metadata
    paySlipGenerated: {
      type: Boolean,
      default: false
    },
    paySlipGeneratedAt: {
      type: Date
    },
    paySlipGeneratedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    paySlipSent: {
      type: Boolean,
      default: false
    },
    paySlipSentAt: {
      type: Date
    },
    paySlipSentTo: {
      type: String,
      trim: true
    },
    // Salary structure reference
    salaryStructure: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryStructure'
    },
    salaryStructureVersion: {
      type: Number,
      default: 1
    },
    // Tax exemption declarations
    taxExemptions: {
      section80C: {
        type: Number,
        default: 0,
        min: 0
      },
      section80D: {
        type: Number,
        default: 0,
        min: 0
      },
      section24: {
        type: Number,
        default: 0,
        min: 0
      },
      hraExemption: {
        type: Number,
        default: 0,
        min: 0
      },
      otherExemptions: {
        type: Number,
        default: 0,
        min: 0
      },
      totalExemptions: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    // Additional metadata
    notes: {
      type: String,
      trim: true
    },
    internalNotes: {
      type: String,
      trim: true
    },
    tags: [{
      type: String,
      trim: true
    }],
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true
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

// Virtual for period display
payrollSchema.virtual('period').get(function() {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${monthNames[this.month - 1]} ${this.year}`;
});

// Virtual for attendance percentage
payrollSchema.virtual('attendancePercentage').get(function() {
  if (this.totalDays === 0) return 0;
  return ((this.presentDays + (this.halfDays * 0.5)) / this.totalDays) * 100;
});

// Virtual for total employer contribution
payrollSchema.virtual('employerContribution').get(function() {
  const pf = this.taxDetails?.providentFund?.employer || 0;
  const esi = this.taxDetails?.esi?.employer || 0;
  return pf + esi;
});

// Virtual for cost to company (CTC)
payrollSchema.virtual('costToCompany').get(function() {
  return this.grossSalary + (this.employerContribution || 0);
});

// Instance method to check if payroll can be edited
payrollSchema.methods.canEdit = function() {
  return ['draft', 'pending'].includes(this.status) && !this.isReversed;
};

// Instance method to check if payroll can be paid
payrollSchema.methods.canPay = function() {
  return ['approved', 'pending'].includes(this.status) && !this.isOnHold && !this.isReversed;
};

// Instance method to check if payroll can be reversed
payrollSchema.methods.canReverse = function() {
  return ['paid', 'approved'].includes(this.status) && !this.isReversed;
};

// Instance method to get total payment made
payrollSchema.methods.getTotalPaid = function() {
  if (this.status === 'paid' && this.paymentSplits && this.paymentSplits.length > 0) {
    return this.paymentSplits
      .filter(split => split.status === 'paid')
      .reduce((sum, split) => sum + (split.amount || 0), 0);
  }
  return this.status === 'paid' ? this.netSalary : 0;
};

// Instance method to get pending payment amount
payrollSchema.methods.getPendingAmount = function() {
  const totalPaid = this.getTotalPaid();
  return Math.max(0, this.netSalary - totalPaid);
};

// Static method to calculate YTD values
payrollSchema.statics.calculateYTD = async function(teacherId, year, month) {
  const ytdPayrolls = await this.find({
    teacher: teacherId,
    year: year,
    month: { $lte: month },
    status: { $ne: 'cancelled' },
    isReversed: false
  });
  
  return {
    grossSalary: ytdPayrolls.reduce((sum, p) => sum + (p.grossSalary || 0), 0),
    netSalary: ytdPayrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0),
    taxDeducted: ytdPayrolls.reduce((sum, p) => sum + ((p.taxDetails?.tds || 0) + (p.taxDetails?.incomeTax || 0)), 0)
  };
};

// Compound unique index to prevent duplicate payroll for same teacher in same month/year
payrollSchema.index({ teacher: 1, month: 1, year: 1 }, { unique: true });
payrollSchema.index({ college: 1, month: 1, year: 1 });
payrollSchema.index({ teacher: 1 });
payrollSchema.index({ status: 1 });
payrollSchema.index({ payrollNumber: 1 });
payrollSchema.index({ isReversed: 1 });
payrollSchema.index({ isOnHold: 1 });
payrollSchema.index({ approvedBy: 1 });
payrollSchema.index({ paymentDate: 1 });
payrollSchema.index({ createdAt: 1 });
payrollSchema.index({ department: 1 });
payrollSchema.index({ costCenter: 1 });
payrollSchema.index({ salaryStructure: 1 });

// Ensure virtuals are included in JSON output
payrollSchema.set('toJSON', { virtuals: true });
payrollSchema.set('toObject', { virtuals: true });

// Pre-save hook to calculate all payroll amounts
payrollSchema.pre('save', function(next) {
  // Calculate total allowances from items
  this.totalAllowances = this.items
    .filter(item => item.type === 'allowance')
    .reduce((sum, item) => sum + item.amount, 0);
  
  // Add overtime, bonus, incentives, leave encashment, arrears, and reimbursements to allowances
  this.totalAllowances += (this.overtimeAmount || 0) + 
                          (this.bonus || 0) + 
                          (this.incentives || 0) + 
                          (this.leaveEncashment?.amount || 0) + 
                          (this.arrears?.amount || 0) +
                          (this.reimbursements?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0);
  
  // Calculate total deductions from items
  this.totalDeductions = this.items
    .filter(item => item.type === 'deduction')
    .reduce((sum, item) => sum + item.amount, 0);
  
  // Calculate PF and ESI totals if not set
  if (this.taxDetails) {
    if (this.taxDetails.providentFund) {
      const pfEmployee = this.taxDetails.providentFund.employee || 0;
      const pfEmployer = this.taxDetails.providentFund.employer || 0;
      this.taxDetails.providentFund.total = pfEmployee + pfEmployer;
    }
    if (this.taxDetails.esi) {
      const esiEmployee = this.taxDetails.esi.employee || 0;
      const esiEmployer = this.taxDetails.esi.employer || 0;
      this.taxDetails.esi.total = esiEmployee + esiEmployer;
    }
    
    // Add tax details to deductions
    this.totalDeductions += (this.taxDetails.incomeTax || 0) +
                           (this.taxDetails.tds || 0) +
                           (this.taxDetails.providentFund?.employee || 0) +
                           (this.taxDetails.esi?.employee || 0) +
                           (this.taxDetails.professionalTax || 0) +
                           (this.taxDetails.otherTaxes || 0);
  }
  
  // Add loan deductions
  if (this.loanDeductions && this.loanDeductions.length > 0) {
    this.totalDeductions += this.loanDeductions.reduce((sum, loan) => sum + (loan.total || 0), 0);
  }
  
  // Add advance deductions
  if (this.advanceDeductions && this.advanceDeductions.length > 0) {
    this.totalDeductions += this.advanceDeductions.reduce((sum, advance) => sum + (advance.amount || 0), 0);
  }
  
  // Calculate gross salary
  this.grossSalary = this.baseSalary + this.totalAllowances;
  
  // Calculate total tax exemptions
  if (this.taxExemptions) {
    this.taxExemptions.totalExemptions = 
      (this.taxExemptions.section80C || 0) +
      (this.taxExemptions.section80D || 0) +
      (this.taxExemptions.section24 || 0) +
      (this.taxExemptions.hraExemption || 0) +
      (this.taxExemptions.otherExemptions || 0);
  }
  
  // Calculate taxable income (gross salary minus tax exemptions)
  if (this.taxDetails) {
    this.taxDetails.taxableIncome = this.grossSalary - (this.taxExemptions?.totalExemptions || 0);
  }
  
  // Calculate net salary
  this.netSalary = this.grossSalary - this.totalDeductions;
  
  // Ensure net salary is not negative
  if (this.netSalary < 0) {
    this.netSalary = 0;
  }
  
  // Update status based on conditions
  if (this.isOnHold && this.status !== 'on-hold') {
    this.status = 'on-hold';
  }
  
  if (this.isReversed && this.status !== 'reversed') {
    this.status = 'reversed';
  }
  

});

module.exports = mongoose.model('Payroll', payrollSchema);

