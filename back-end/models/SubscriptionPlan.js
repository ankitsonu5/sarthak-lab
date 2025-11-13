const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  planName: {
    type: String,
    required: true,
    unique: true,
    enum: ['trial', 'basic', 'premium']
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
    trialDays: {
      type: Number,
      default: 0
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
      displayName: 'Trial Plan',
      description: '14-day free trial with limited features',
      priceMonthly: 0,
      priceYearly: 0,
      features: {
        maxUsers: 2,
        maxPatients: 50,
        maxReportsPerMonth: 100,
        trialDays: 14,
        customBranding: false,
        apiAccess: false,
        prioritySupport: false,
        dataBackup: false,
        multipleLocations: false
      }
    },
    {
      planName: 'basic',
      displayName: 'Basic Plan',
      description: 'Perfect for small labs',
      priceMonthly: 2999,
      priceYearly: 29990,
      features: {
        maxUsers: 5,
        maxPatients: 5000,
        maxReportsPerMonth: 1000,
        trialDays: 0,
        customBranding: true,
        apiAccess: false,
        prioritySupport: false,
        dataBackup: true,
        multipleLocations: false
      }
    },
    {
      planName: 'premium',
      displayName: 'Premium Plan',
      description: 'Unlimited features for growing labs',
      priceMonthly: 5999,
      priceYearly: 59990,
      features: {
        maxUsers: -1,
        maxPatients: -1,
        maxReportsPerMonth: -1,
        trialDays: 0,
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

