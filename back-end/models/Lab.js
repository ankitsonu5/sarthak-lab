const mongoose = require('mongoose');

const labSchema = new mongoose.Schema({
  labCode: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  labName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    default: 'India',
    trim: true
  },
  pincode: {
    type: String,
    trim: true
  },
  
  // Branding
  logoUrl: {
    type: String
  },
  sideLogoUrl: {
    type: String
  },
  primaryColor: {
    type: String,
    default: '#007bff'
  },
  secondaryColor: {
    type: String,
    default: '#6c757d'
  },
  headerNote: {
    type: String
  },
  footerNote: {
    type: String
  },
  reportDisclaimer: {
    type: String
  },
  reportTemplate: {
    type: String,
    enum: ['classic', 'modern', 'professional'],
    default: 'classic'
  },

  // Subscription
  subscriptionPlan: {
    type: String,
    enum: ['trial', 'basic', 'premium'],
    default: 'trial'
  },
  subscriptionStatus: {
    type: String,
    enum: ['pending', 'active', 'expired', 'cancelled'],
    default: 'pending'
  },
  trialEndsAt: {
    type: Date
  },
  subscriptionEndsAt: {
    type: Date
  },
  subscriptionStartedAt: {
    type: Date
  },
  trialNotificationSent: {
    type: Boolean,
    default: false
  },
  trialNotificationSentAt: {
    type: Date
  },
  
  // Approval
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  
  // Usage Statistics
  totalPatients: {
    type: Number,
    default: 0
  },
  totalReports: {
    type: Number,
    default: 0
  },
  totalUsers: {
    type: Number,
    default: 0
  },
  monthlyReports: {
    type: Number,
    default: 0
  },
  lastReportResetDate: {
    type: Date,
    default: Date.now
  },
  
  // Settings
  settings: {
    printLayout: {
      template: { type: String, enum: ['classic', 'compact', 'minimal'], default: 'classic' },
      showHeader: { type: Boolean, default: true },
      showFooter: { type: Boolean, default: true },
      showQr: { type: Boolean, default: false },
      showRefDoctor: { type: Boolean, default: true },
      showAmount: { type: Boolean, default: true }
    },
    prefixes: {
      receipt: { type: String, default: 'RCP' },
      report: { type: String, default: 'RPT' },
      labYearlyPrefix: { type: String },
      labDailyPrefix: { type: String }
    },
    numbering: {
      receiptStart: { type: Number, default: 1 },
      reportStart: { type: Number, default: 1 },
      resetRule: { type: String, enum: ['yearly', 'monthly', 'never'], default: 'yearly' }
    }
  },
  
  // Soft delete
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
// Note: labCode and email already have unique indexes from field definitions
labSchema.index({ approvalStatus: 1 });
labSchema.index({ subscriptionPlan: 1 });
labSchema.index({ subscriptionStatus: 1 });
labSchema.index({ isActive: 1, deletedAt: 1 });

// Virtual for subscription plan details
labSchema.virtual('planDetails').get(function() {
  const plans = {
    trial: {
      name: 'Trial Plan',
      maxUsers: 2,
      maxPatients: 50,
      maxReportsPerMonth: 100,
      trialDays: 14,
      price: 0
    },
    basic: {
      name: 'Basic Plan',
      maxUsers: 5,
      maxPatients: 5000,
      maxReportsPerMonth: 1000,
      priceMonthly: 2999,
      priceYearly: 29990
    },
    premium: {
      name: 'Premium Plan',
      maxUsers: -1, // unlimited
      maxPatients: -1,
      maxReportsPerMonth: -1,
      priceMonthly: 5999,
      priceYearly: 59990
    }
  };
  return plans[this.subscriptionPlan] || plans.trial;
});

// Method to check if lab can add more users
labSchema.methods.canAddUser = function() {
  const maxUsers = this.planDetails.maxUsers;
  if (maxUsers === -1) return true; // unlimited
  return this.totalUsers < maxUsers;
};

// Method to check if lab can add more patients
labSchema.methods.canAddPatient = function() {
  const maxPatients = this.planDetails.maxPatients;
  if (maxPatients === -1) return true; // unlimited
  return this.totalPatients < maxPatients;
};

// Method to check if lab can create more reports this month
labSchema.methods.canCreateReport = function() {
  const maxReports = this.planDetails.maxReportsPerMonth;
  if (maxReports === -1) return true; // unlimited
  
  // Reset monthly counter if needed
  const now = new Date();
  const lastReset = new Date(this.lastReportResetDate);
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    this.monthlyReports = 0;
    this.lastReportResetDate = now;
  }
  
  return this.monthlyReports < maxReports;
};

// Method to check if trial has expired
labSchema.methods.isTrialExpired = function() {
  if (this.subscriptionPlan !== 'trial') return false;
  if (!this.trialEndsAt) return false;
  return new Date() > new Date(this.trialEndsAt);
};

// Method to check if subscription is valid
labSchema.methods.hasValidSubscription = function() {
  if (this.subscriptionStatus !== 'active') return false;
  if (this.isTrialExpired()) return false;
  if (this.subscriptionEndsAt && new Date() > new Date(this.subscriptionEndsAt)) return false;
  return true;
};

// Static method to generate unique lab code
labSchema.statics.generateLabCode = async function() {
  const count = await this.countDocuments();
  const labNumber = count + 1;
  return `LAB${String(labNumber).padStart(5, '0')}`;
};

// Pre-save middleware to check trial expiry
labSchema.pre('save', function(next) {
  if (this.subscriptionPlan === 'trial' && this.isTrialExpired()) {
    this.subscriptionStatus = 'expired';
  }
  next();
});

module.exports = mongoose.model('Lab', labSchema);

