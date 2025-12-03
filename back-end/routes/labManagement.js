const express = require('express');
const router = express.Router();
const Lab = require('../models/Lab');
const User = require('../models/User');
const Patient = require('../models/Patient');
const PathologyRegistration = require('../models/PathologyRegistration');
const { authenticateToken } = require('../middlewares/auth');
const { sendEmail } = require('../utils/mailer');

/**
 * @route   POST /api/lab-management/register
 * @desc    Register a new lab (public endpoint)
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    const {
      labName,
      email,
      phone,
      address,
      city,
      state,
      country,
      pincode,
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPhone,
      password
    } = req.body;

    console.log('🏥 New lab registration request:', { labName, email });

    // Validation
    if (!labName || !email || !password || !adminFirstName || !adminEmail) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: labName, email, password, adminFirstName, adminEmail'
      });
    }

    // Check if lab email already exists
    const existingLab = await Lab.findOne({ email: email.toLowerCase() });
    if (existingLab) {
      return res.status(409).json({
        success: false,
        message: 'A lab with this email already exists'
      });
    }

    // Check if admin email already exists
    const existingUser = await User.findOne({ email: adminEmail.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    // Generate unique lab code
    const labCode = await Lab.generateLabCode();

    // Calculate trial end date (10 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 10);

    // Calculate subscription end date (same as trial for now)
    const subscriptionEndsAt = new Date(trialEndsAt);

    // Create lab with auto-approval and active trial
    const lab = new Lab({
      labCode,
      labName,
      email: email.toLowerCase(),
      phone,
      address,
      city,
      state,
      country: country || 'India',
      pincode,
      subscriptionPlan: 'trial',
      subscriptionStatus: 'active', // Auto-activate trial
      trialEndsAt,
      subscriptionEndsAt,
      approvalStatus: 'approved', // Auto-approve new registrations
      approvedAt: new Date(),
      totalUsers: 1 // Will be created below
    });

    await lab.save();

    // Default routes for LabAdmin - full pathology access
    const defaultLabAdminRoutes = [
      // Setup
      '/setup/doctors', '/setup/doctors/doctor-list', '/setup/category-heads', '/setup/prefixes',
      '/setup/pathology/test-master', '/setup/pathology/test-entry', '/setup/pathology/test-database',
      '/setup/pathology/test-panels', '/setup/pathology/reference-ranges',
      // Patients
      '/reception/search-patient', '/reception/patient-registration',
      // Tests / Lab Reports
      '/pathology/test-report', '/pathology/all-reports', '/pathology/reports-records', '/pathology/test-summary',
      // Appointments / Sample Collection
      '/appointments', '/pathology/scheduled-tests', '/pathology/registration',
      // Billing / Payments
      '/cash-receipt/register-opt-ipd', '/billing', '/cash-receipt/edit-history',
      // Inventory
      '/inventory/manage', '/inventory/stock-expiry',
      // Analytics / Reports
      '/reporting/daily-cash-report', '/reporting/daily-cash-summary',
      // Lab Setup
      '/lab-setup', '/lab-setup/template-setup',
      // Subscription
      '/pathology/my-subscription'
    ];

    // Create lab admin user
    const adminUser = new User({
      labId: lab._id,
      username: adminEmail.split('@')[0],
      email: adminEmail.toLowerCase(),
      password, // Will be hashed by pre-save hook
      role: 'LabAdmin',
      firstName: adminFirstName,
      lastName: adminLastName || '',
      phone: adminPhone || phone,
      isActive: true,
      allowedRoutes: defaultLabAdminRoutes
    });

    await adminUser.save();

    console.log('✅ Lab registered successfully:', labCode);
    console.log('🎉 Auto-approved with 10-day free trial');

    res.status(201).json({
      success: true,
      message: 'Lab registered successfully! Your 10-day free trial has started. You can login now.',
      lab: {
        id: lab._id,
        labCode: lab.labCode,
        labName: lab.labName,
        email: lab.email,
        subscriptionPlan: lab.subscriptionPlan,
        subscriptionStatus: lab.subscriptionStatus,
        approvalStatus: lab.approvalStatus,
        trialEndsAt: lab.trialEndsAt
      },
      admin: {
        id: adminUser._id,
        email: adminUser.email,
        name: `${adminUser.firstName} ${adminUser.lastName}`.trim(),
        role: adminUser.role
      },
      trial: {
        duration: '10 days',
        endsAt: lab.trialEndsAt,
        daysRemaining: 10
      }
    });

  } catch (error) {
    console.error('❌ Lab registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register lab',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/lab-management/labs
 * @desc    Get all labs (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.get('/labs', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const { status, plan, page = 1, limit = 100 } = req.query;
    const skip = (page - 1) * limit;

    let filter = { deletedAt: null };

    if (status) {
      filter.approvalStatus = status;
    }

    if (plan) {
      filter.subscriptionPlan = plan;
    }

    // Get total count and labs in parallel for speed
    const [total, labs] = await Promise.all([
      Lab.countDocuments(filter),
      Lab.find(filter)
        .select('labCode labName email phone city state subscriptionPlan subscriptionStatus approvalStatus trialEndsAt subscriptionEndsAt trialNotificationSent totalUsers totalPatients totalReports createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean()
    ]);

    // Get all lab IDs
    const labIds = labs.map(lab => lab._id);

    // Fetch all admin users in ONE query (optimized)
    const adminUsers = await User.find({
      labId: { $in: labIds },
      role: 'LabAdmin'
    }).select('labId firstName lastName email profilePicture').lean();

    // Create a map for quick lookup
    const adminMap = {};
    adminUsers.forEach(admin => {
      adminMap[admin.labId.toString()] = {
        _id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        profilePicture: admin.profilePicture
      };
    });

    // Attach admin to each lab
    const labsWithAdmin = labs.map(lab => ({
      ...lab,
      adminUser: adminMap[lab._id.toString()] || null
    }));

    res.json({
      success: true,
      labs: labsWithAdmin,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching labs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch labs',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/lab-management/my-lab
 * @desc    Get current user's lab details
 * @access  Private (Lab users)
 */
router.get('/my-lab', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user.labId) {
      return res.status(400).json({
        success: false,
        message: 'Lab context not found'
      });
    }

    const lab = await Lab.findById(user.labId);

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    res.json({
      success: true,
      lab
    });

  } catch (error) {
    console.error('❌ Error fetching lab details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lab details',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/lab-management/labs/:id/approve
 * @desc    Approve a lab (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.put('/labs/:id/approve', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const labId = req.params.id;

    const lab = await Lab.findOneAndUpdate(
      { _id: labId, approvalStatus: 'pending' },
      {
        approvalStatus: 'approved',
        subscriptionStatus: 'active',
        approvedBy: user.userId,
        approvedAt: new Date()
      },
      { new: true }
    );

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found or already processed'
      });
    }

    console.log('✅ Lab approved:', lab.labCode);

    res.json({
      success: true,
      message: 'Lab approved successfully',
      lab: {
        id: lab._id,
        labName: lab.labName,
        labCode: lab.labCode,
        email: lab.email
      }
    });

  } catch (error) {
    console.error('❌ Error approving lab:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve lab',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/lab-management/labs/:id/reject
 * @desc    Reject a lab (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.put('/labs/:id/reject', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const labId = req.params.id;
    const { reason } = req.body;

    const lab = await Lab.findOneAndUpdate(
      { _id: labId, approvalStatus: 'pending' },
      {
        approvalStatus: 'rejected',
        rejectionReason: reason || 'No reason provided',
        approvedBy: user.userId,
        approvedAt: new Date()
      },
      { new: true }
    );

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found or already processed'
      });
    }

    console.log('❌ Lab rejected:', lab.labCode);

    res.json({
      success: true,
      message: 'Lab rejected',
      lab: {
        id: lab._id,
        labName: lab.labName,
        labCode: lab.labCode,
        email: lab.email,
        rejectionReason: lab.rejectionReason
      }
    });

  } catch (error) {
    console.error('❌ Error rejecting lab:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject lab',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/lab-management/labs/:id
 * @desc    Get single lab profile (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.get('/labs/:id', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Only Super Admin can access
    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const lab = await Lab.findById(req.params.id)
      .populate('approvedBy', 'firstName lastName email');

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Get usage stats
    // Note: Multi-tenant labId filtering will be added when models are updated
    const totalUsers = await User.countDocuments({ labId: lab.labCode }).catch(() => 0);
    const totalPatients = await Patient.countDocuments({}).catch(() => 0); // No labId field yet
    const totalReports = await PathologyRegistration.countDocuments({}).catch(() => 0); // No labId field yet

    // Get monthly reports (current month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthlyReports = await PathologyRegistration.countDocuments({
      createdAt: { $gte: startOfMonth }
    }).catch(() => 0);

    // Add stats to lab object
    const labData = lab.toObject();
    labData.totalUsers = totalUsers || 0;
    labData.totalPatients = totalPatients || 0;
    labData.totalReports = totalReports || 0;
    labData.monthlyReports = monthlyReports || 0;

    res.json({
      success: true,
      lab: labData
    });

  } catch (error) {
    console.error('❌ Error fetching lab profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/lab-management/labs/:id/users
 * @desc    Get all users of a specific lab (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.get('/labs/:id/users', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Only Super Admin can access
    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const users = await User.find({ labId: req.params.id })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users,
      count: users.length
    });

  } catch (error) {
    console.error('❌ Error fetching lab users:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/lab-management/labs/:id/send-trial-notification
 * @desc    Send trial ending notification to lab admin (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.post('/labs/:id/send-trial-notification', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const labId = req.params.id;
    const lab = await Lab.findById(labId);

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Find lab admin user to get email
    const labAdmin = await User.findOne({ labId: lab._id, role: 'LabAdmin' });
    const adminEmail = labAdmin?.email || lab.email;

    // Calculate days left
    const daysLeft = lab.trialEndsAt
      ? Math.ceil((new Date(lab.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

    // Generate email content with pricing
    const emailSubject = daysLeft <= 0
      ? `🚨 Your Trial Has Expired - ${lab.labName}`
      : `⚠️ Your Trial Period is Ending Soon - ${lab.labName}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">🔬 Lab Book Pathology</h1>
        </div>

        <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0;">
          <h2 style="color: #1e3a5f; margin-top: 0;">Hello ${labAdmin?.firstName || 'Admin'},</h2>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
            Your <strong>10-day free trial</strong> for <strong>${lab.labName}</strong>
            ${daysLeft <= 0
              ? '<strong style="color: #e53e3e;">has expired!</strong> Please subscribe to continue using our services.'
              : `is ending in <strong style="color: #dd6b20;">${daysLeft} day(s)</strong>.`}
          </p>

          <div style="background: ${daysLeft <= 0 ? '#f8d7da' : '#fff3cd'}; border: 1px solid ${daysLeft <= 0 ? '#f5c6cb' : '#ffc107'}; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: ${daysLeft <= 0 ? '#721c24' : '#856404'};">
              <strong>⏰ Trial ${daysLeft <= 0 ? 'Expired' : 'Expiry'}:</strong> ${lab.trialEndsAt ? new Date(lab.trialEndsAt).toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              }) : 'N/A'}
            </p>
          </div>

          <h3 style="color: #1e3a5f; text-align: center;">💰 Our Affordable Plans</h3>
          <div style="display: flex; gap: 15px; margin: 20px 0; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 200px; background: white; border: 2px solid #007bff; border-radius: 10px; padding: 20px; text-align: center;">
              <h4 style="margin: 0 0 10px 0; color: #007bff;">Basic Plan</h4>
              <div style="font-size: 28px; font-weight: bold; color: #1e3a5f;">₹2,000<span style="font-size: 14px; color: #666;">/month</span></div>
              <ul style="text-align: left; padding-left: 20px; margin: 15px 0; color: #555; font-size: 14px;">
                <li>Unlimited Reports</li>
                <li>Email Support</li>
                <li>All Core Features</li>
              </ul>
            </div>
            <div style="flex: 1; min-width: 200px; background: linear-gradient(135deg, #fff9e6 0%, #fff 100%); border: 2px solid #f5af19; border-radius: 10px; padding: 20px; text-align: center;">
              <h4 style="margin: 0 0 10px 0; color: #d69e00;">Premium Plan ⭐</h4>
              <div style="font-size: 28px; font-weight: bold; color: #1e3a5f;">₹5,000<span style="font-size: 14px; color: #666;">/month</span></div>
              <ul style="text-align: left; padding-left: 20px; margin: 15px 0; color: #555; font-size: 14px;">
                <li>Everything in Basic</li>
                <li>Priority Support</li>
                <li>Advanced Analytics</li>
                <li>Custom Branding</li>
              </ul>
            </div>
          </div>

          <h3 style="color: #1e3a5f;">Why Upgrade?</h3>
          <ul style="color: #4a5568; line-height: 1.8;">
            <li>✅ Unlimited patient registrations</li>
            <li>✅ Unlimited pathology reports</li>
            <li>✅ Custom branding & templates</li>
            <li>✅ Priority customer support</li>
            <li>✅ Data backup & security</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/subscription"
               style="background: #28a745; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold; display: inline-block;">
              💳 Subscribe Now - Just ₹2000/month
            </a>
          </div>

          <p style="color: #718096; font-size: 14px; text-align: center;">
            ${daysLeft <= 0
              ? 'Your access has been limited. Subscribe now to unlock all features!'
              : 'After trial expires, you won\'t be able to create new reports or access premium features.'}
            <br>Your existing data will remain safe.
          </p>
        </div>

        <div style="background: #1e3a5f; color: white; padding: 15px; text-align: center; border-radius: 0 0 8px 8px;">
          <p style="margin: 0; font-size: 12px;">
            Need help? Contact us at support@labbookpathology.com<br>
            © ${new Date().getFullYear()} Lab Book Pathology. All rights reserved.
          </p>
        </div>
      </div>
    `;

    // Send email
    const emailSent = await sendEmail({
      to: adminEmail,
      subject: emailSubject,
      html: emailHtml,
      text: `Your trial for ${lab.labName} is ${daysLeft <= 0 ? 'expired' : `ending in ${daysLeft} day(s)`}. Please upgrade to continue using our services.`
    });

    // Update lab to mark notification sent
    await Lab.findByIdAndUpdate(labId, {
      trialNotificationSent: true,
      trialNotificationSentAt: new Date()
    });

    console.log(`📧 Trial notification sent to ${adminEmail} for lab ${lab.labCode}`);

    res.json({
      success: true,
      message: `Trial notification sent to ${adminEmail}`,
      emailSent
    });

  } catch (error) {
    console.error('❌ Error sending trial notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/lab-management/labs/:id/extend-trial
 * @desc    Extend lab trial period (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.put('/labs/:id/extend-trial', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const labId = req.params.id;
    const { days } = req.body;

    if (!days || isNaN(days) || days < 1) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid number of days (minimum 1)'
      });
    }

    const lab = await Lab.findById(labId);

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Calculate new trial end date
    const currentEndDate = lab.trialEndsAt ? new Date(lab.trialEndsAt) : new Date();
    const newEndDate = new Date(currentEndDate);
    newEndDate.setDate(newEndDate.getDate() + parseInt(days));

    // Update lab
    const updatedLab = await Lab.findByIdAndUpdate(
      labId,
      {
        trialEndsAt: newEndDate,
        subscriptionEndsAt: newEndDate,
        subscriptionStatus: 'active',
        trialNotificationSent: false // Reset notification flag
      },
      { new: true }
    );

    console.log(`✅ Trial extended for ${lab.labCode} by ${days} days until ${newEndDate}`);

    res.json({
      success: true,
      message: `Trial extended by ${days} days`,
      lab: {
        id: updatedLab._id,
        labCode: updatedLab.labCode,
        labName: updatedLab.labName,
        trialEndsAt: updatedLab.trialEndsAt
      }
    });

  } catch (error) {
    console.error('❌ Error extending trial:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extend trial',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/lab-management/labs/:id/upgrade-plan
 * @desc    Upgrade lab to paid plan (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.put('/labs/:id/upgrade-plan', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const labId = req.params.id;
    const { plan, durationMonths } = req.body;

    if (!plan || !['basic', 'premium'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid plan (basic or premium)'
      });
    }

    const months = parseInt(durationMonths) || 12; // Default 1 year

    const lab = await Lab.findById(labId);

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Calculate subscription end date
    const subscriptionEndsAt = new Date();
    subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + months);

    // Update lab
    const updatedLab = await Lab.findByIdAndUpdate(
      labId,
      {
        subscriptionPlan: plan,
        subscriptionStatus: 'active',
        subscriptionEndsAt,
        trialNotificationSent: false
      },
      { new: true }
    );

    // Send confirmation email
    const labAdmin = await User.findOne({ labId: lab._id, role: 'LabAdmin' });
    const adminEmail = labAdmin?.email || lab.email;

    await sendEmail({
      to: adminEmail,
      subject: `🎉 Subscription Upgraded - ${lab.labName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #28a745;">🎉 Congratulations!</h2>
          <p>Your lab <strong>${lab.labName}</strong> has been upgraded to the <strong>${plan.toUpperCase()}</strong> plan.</p>
          <p><strong>Subscription Valid Until:</strong> ${subscriptionEndsAt.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}</p>
          <p>Thank you for choosing Lab Book Pathology!</p>
        </div>
      `,
      text: `Your lab ${lab.labName} has been upgraded to ${plan} plan. Valid until: ${subscriptionEndsAt.toLocaleDateString()}`
    });

    console.log(`✅ Lab ${lab.labCode} upgraded to ${plan} plan`);

    res.json({
      success: true,
      message: `Lab upgraded to ${plan} plan for ${months} months`,
      lab: {
        id: updatedLab._id,
        labCode: updatedLab.labCode,
        labName: updatedLab.labName,
        subscriptionPlan: updatedLab.subscriptionPlan,
        subscriptionEndsAt: updatedLab.subscriptionEndsAt
      }
    });

  } catch (error) {
    console.error('❌ Error upgrading plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upgrade plan',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/lab-management/expiring-trials
 * @desc    Get all labs with expiring trials (for cron job/scheduler)
 * @access  Private (SuperAdmin)
 */
router.get('/expiring-trials', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const { daysThreshold = 3 } = req.query;

    // Find labs with trial ending within threshold days
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + parseInt(daysThreshold));

    const expiringLabs = await Lab.find({
      subscriptionPlan: 'trial',
      subscriptionStatus: 'active',
      trialEndsAt: { $lte: thresholdDate },
      deletedAt: null
    }).select('labCode labName email trialEndsAt trialNotificationSent');

    res.json({
      success: true,
      count: expiringLabs.length,
      labs: expiringLabs
    });

  } catch (error) {
    console.error('❌ Error fetching expiring trials:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expiring trials',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/lab-management/send-bulk-notifications
 * @desc    Send trial notifications to all expiring labs (for cron job)
 * @access  Private (SuperAdmin)
 */
router.post('/send-bulk-notifications', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const { daysThreshold = 3 } = req.body;

    // Find labs with trial ending within threshold days that haven't been notified
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + parseInt(daysThreshold));

    const expiringLabs = await Lab.find({
      subscriptionPlan: 'trial',
      subscriptionStatus: 'active',
      trialEndsAt: { $lte: thresholdDate },
      trialNotificationSent: { $ne: true },
      deletedAt: null
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const lab of expiringLabs) {
      try {
        const labAdmin = await User.findOne({ labId: lab._id, role: 'LabAdmin' });
        const adminEmail = labAdmin?.email || lab.email;
        const daysLeft = Math.ceil((new Date(lab.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24));

        await sendEmail({
          to: adminEmail,
          subject: `⚠️ Your Trial is Ending Soon - ${lab.labName}`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Hello ${labAdmin?.firstName || 'Admin'},</h2>
              <p>Your trial for <strong>${lab.labName}</strong> is ending in <strong>${daysLeft} day(s)</strong>.</p>
              <p>Please upgrade to continue using our services.</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/subscription"
                 style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                Upgrade Now
              </a>
            </div>
          `,
          text: `Your trial for ${lab.labName} is ending in ${daysLeft} day(s). Please upgrade.`
        });

        await Lab.findByIdAndUpdate(lab._id, {
          trialNotificationSent: true,
          trialNotificationSentAt: new Date()
        });

        sentCount++;
      } catch (err) {
        console.error(`Failed to notify lab ${lab.labCode}:`, err.message);
        failedCount++;
      }
    }

    console.log(`📧 Bulk notifications sent: ${sentCount} success, ${failedCount} failed`);

    res.json({
      success: true,
      message: `Notifications sent to ${sentCount} labs`,
      stats: {
        total: expiringLabs.length,
        sent: sentCount,
        failed: failedCount
      }
    });

  } catch (error) {
    console.error('❌ Error sending bulk notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk notifications',
      error: error.message
    });
  }
});

module.exports = router;

