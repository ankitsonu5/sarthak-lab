const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  planName: {
    type: String,
    required: true,
    unique: true
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  priceMonthly: {
    type: Number,
    default: 0
  },
  priceYearly: {
    type: Number,
    default: 0
  },
  // Discount/Offer fields
  discountPercent: {
    type: Number,
    default: 0
  },
  offerText: {
    type: String,
    default: ''
  },
  offerValidTill: {
    type: Date,
    default: null
  },
  // Duration for trial plans
  trialDays: {
    type: Number,
    default: 0
  },
  // Feature list (flexible array of strings for display)
  featureList: [{
    type: String
  }],
  // Detailed features object
  features: {
    maxUsers: {
      type: Number,
      default: -1 // -1 means unlimited
    },
    maxPatients: {
      type: Number,
      default: -1
    },
    maxReportsPerMonth: {
      type: Number,
      default: -1
    },
    customBranding: {
      type: Boolean,
      default: false
    },
    apiAccess: {
      type: Boolean,
      default: false
    },
    prioritySupport: {
      type: Boolean,
      default: false
    },
    dataBackup: {
      type: Boolean,
      default: false
    },
    multipleLocations: {
      type: Boolean,
      default: false
    }
  },
  // Display order
  sortOrder: {
    type: Number,
    default: 0
  },
  // Styling
  badgeColor: {
    type: String,
    default: '#007bff'
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Seed default plans
subscriptionPlanSchema.statics.seedDefaultPlans = async function() {
  const plans = [
    {
      planName: 'trial',
      displayName: 'Trial',
      description: '10 days free trial',
      priceMonthly: 0,
      priceYearly: 0,
      trialDays: 10,
      sortOrder: 1,
      badgeColor: '#17a2b8',
      featureList: ['10 Days Free Trial', 'All Features Included', 'Limited Reports'],
      features: {
        maxUsers: 2,
        maxPatients: 50,
        maxReportsPerMonth: 100,
        customBranding: false,
        apiAccess: false,
        prioritySupport: false,
        dataBackup: false,
        multipleLocations: false
      }
    },
    {
      planName: 'basic',
      displayName: 'Basic',
      description: 'Perfect for small labs',
      priceMonthly: 2000,
      priceYearly: 20000,
      trialDays: 0,
      sortOrder: 2,
      badgeColor: '#007bff',
      featureList: ['Unlimited Reports', 'Email Support', 'All Core Features'],
      features: {
        maxUsers: 5,
        maxPatients: -1,
        maxReportsPerMonth: -1,
        customBranding: false,
        apiAccess: false,
        prioritySupport: false,
        dataBackup: true,
        multipleLocations: false
      }
    },
    {
      planName: 'premium',
      displayName: 'Premium',
      description: 'Unlimited features for growing labs',
      priceMonthly: 5000,
      priceYearly: 50000,
      trialDays: 0,
      sortOrder: 3,
      badgeColor: '#f5af19',
      isPopular: true,
      featureList: ['Everything in Basic', 'Priority Support', 'Advanced Analytics', 'Custom Branding'],
      features: {
        maxUsers: -1,
        maxPatients: -1,
        maxReportsPerMonth: -1,
        customBranding: true,
        apiAccess: true,
        prioritySupport: true,
        dataBackup: true,
        multipleLocations: true
      }
    }
  ];

  for (const plan of plans) {
    await this.findOneAndUpdate(
      { planName: plan.planName },
      plan,
      { upsert: true, new: true }
    );
  }

  console.log('✅ Subscription plans seeded successfully');
};

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

