const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const User = require('../models/User');
const Lab = require('../models/Lab');
const { sendEmail } = require('../utils/mailer');
const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'users');
fs.mkdirSync(uploadDir, { recursive: true });

// Multer config for user profile pictures
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '') || '.png';
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

// Register new user (legacy direct-create with temp password)
// NOTE: New UI should prefer /auth/invite-user which sends an email invite
//       and lets the user create their own password.
// - SuperAdmin: can create any user (global)
// - LabAdmin/Admin: can create ONLY staff users within their own lab, and only if subscription is valid
router.post('/register', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const actor = req.user;
    const isSuperAdmin = actor.role === 'SuperAdmin';
    const isLabAdmin = !isSuperAdmin && (actor.role === 'LabAdmin' || actor.role === 'Admin');

    if (!isSuperAdmin && !isLabAdmin) {
      return res.status(403).json({ message: 'Only SuperAdmin or Lab Admin can create users' });
    }

    const { username, email, password, role, firstName, lastName, phone } = req.body;

    // Normalize
    const emailNorm = String(email || '').trim().toLowerCase();
    const roleNorm = String(role || '').trim();
    const phoneNorm = String(phone || '').trim();

    // Lab Admin can create any custom role EXCEPT SuperAdmin or LabAdmin
    if (isLabAdmin) {
      const restrictedRoles = ['SuperAdmin', 'LabAdmin'];
      if (restrictedRoles.includes(roleNorm)) {
        return res.status(403).json({
          message: 'Lab Admin cannot create SuperAdmin or LabAdmin accounts'
        });
      }
    }

    // Check if user already exists by email or phone (username can duplicate by role policy)
    const orConds = [{ email: emailNorm }];
    if (phoneNorm) orConds.push({ phone: phoneNorm });

    const existingUser = await User.findOne({ $or: orConds });
    if (existingUser) {
      const which = existingUser.email === emailNorm ? 'email' : (existingUser.phone === phoneNorm ? 'phone' : 'email/phone');
      console.warn('🚫 Duplicate user attempt:', { emailNorm, phoneNorm, matchedBy: which, existingId: existingUser._id?.toString() });
      return res.status(400).json({ message: `User with this ${which} already exists` });
    }

    // Auto username by role if needed
    let finalUsername = (username || '').trim();
    const roleLc = roleNorm.toLowerCase();
    if (!finalUsername) {
      if (roleLc === 'admin') finalUsername = 'admin';
      else if (roleLc === 'pathology') finalUsername = 'pathology';
      else if (roleLc === 'pharmacy') finalUsername = 'pharmacy';
      else finalUsername = (emailNorm.split('@')[0] || 'user').trim();
    }

    let lab = null;

    // For LabAdmin/Admin: enforce lab scope & subscription before creating staff users
    if (isLabAdmin) {
      if (!actor.labId) {
        return res.status(400).json({ message: 'Your account is not linked to any lab. Cannot create users.' });
      }

      lab = await Lab.findById(actor.labId);
      if (!lab) {
        return res.status(404).json({ message: 'Lab not found for your account' });
      }

      // Enforce subscription validity and user count limits
      if (!lab.hasValidSubscription()) {
        return res.status(403).json({
          message: 'Your lab subscription is not active. Please renew or upgrade to add more users.',
          subscriptionStatus: lab.subscriptionStatus,
          subscriptionPlan: lab.subscriptionPlan,
          trialEndsAt: lab.trialEndsAt,
          subscriptionEndsAt: lab.subscriptionEndsAt
        });
      }

      if (!lab.canAddUser()) {
        const details = lab.planDetails || {};
        return res.status(403).json({
          message: 'Your current subscription plan user limit has been reached. Please upgrade your plan to add more users.',
          subscriptionPlan: lab.subscriptionPlan,
          subscriptionStatus: lab.subscriptionStatus,
          totalUsers: lab.totalUsers,
          maxUsers: details.maxUsers
        });
      }
    }

    // Create new user (SuperAdmin: global, LabAdmin/Admin: lab-scoped)
    const user = new User({
      username: finalUsername,
      email: emailNorm,
      password,
      role: roleNorm,
      firstName,
      lastName,
      phone: phoneNorm,
      labId: isLabAdmin && lab ? lab._id : null
    });

    await user.save();

    // If created under a lab, increment lab user count
    if (isLabAdmin && lab) {
      lab.totalUsers = (lab.totalUsers || 0) + 1;
      await lab.save();
    }

    console.log('✅ User saved to DB (legacy /register):', { id: user._id.toString(), email: user.email, role: user.role, labId: user.labId });

    // Send welcome email with login credentials
    const plainPassword = password; // Received in req body
    const labName = lab ? lab.name : 'Sarthak Diagnostic Network';
    const labNameHi = lab && lab.nameHindi ? lab.nameHindi : 'सार्थक डायग्नोस्टिक नेटवर्क';
    const emailSubject = `${labName} - आपका अकाउंट बना दिया गया है | Account Created`;
    const emailHtml = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:8px;">
        <h2 style="color:#2196F3;text-align:center;">${labNameHi}</h2>
        <h3 style="text-align:center;color:#666;">${labName}</h3>
        <hr style="border:1px solid #eee;margin:20px 0;">
        <p>प्रिय ${firstName || 'User'},</p>
        <p>आपका अकाउंट <b>${labName}</b> में बना दिया गया है।</p>
        <div style="background:#f5f5f5;padding:15px;border-radius:5px;margin:15px 0;">
          <p style="margin:5px 0;"><strong>👤 Role (भूमिका):</strong> ${role}</p>
          <p style="margin:5px 0;"><strong>📧 Login ID (Email):</strong> ${email}</p>
          <p style="margin:5px 0;"><strong>🔑 Password:</strong> ${plainPassword}</p>
        </div>
        <p style="color:#f44336;"><strong>⚠️ सुरक्षा के लिए, पहली बार लॉगिन करने के बाद अपना पासवर्ड बदल लें।</strong></p>
        <p style="color:#666;">For security, please change your password after first login.</p>
        <hr style="border:1px solid #eee;margin:20px 0;">
        <p style="color:#888;font-size:12px;">Regards,<br/>${labName} Team</p>
      </div>`;
    const adminDoc = await User.findById(req.user.userId);
    let emailSent = false;
    try {
      emailSent = await sendEmail({
        to: email,
        subject: emailSubject,
        text: `Lab: ${labName}\nRole: ${role}\nLogin Email: ${email}\nPassword: ${plainPassword}\n\nकृपया पहली बार लॉगिन करने के बाद अपना पासवर्ड बदल लें।`,
        html: emailHtml,
        fromUser: adminDoc
      });
      console.log(emailSent ? '📧 Welcome email sent to ' + email : '📭 Welcome email not sent (SMTP not configured).');
    } catch (err) {
      console.warn('📭 Email send skipped:', err?.message || err);
      emailSent = false;
    }

    // For /register we keep returning token (legacy behaviour)
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      (process.env.JWT_SECRET || 'hospital_management_secret_key_2025_secure_token'),
      { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user,
      emailSent: typeof emailSent !== 'undefined' ? !!emailSent : undefined
    });
  } catch (error) {
    // Handle duplicate key errors gracefully
    if (error && (error.code === 11000 || error.name === 'MongoServerError')) {
      const fields = Object.keys(error.keyPattern || {});
      const which = fields.includes('email') ? 'email' : (fields.includes('phone') ? 'phone' : 'email/phone');
      return res.status(400).json({ message: `User with this ${which} already exists` });
    }
    console.error('❌ Register error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ================= INVITE-BASED USER CREATION =================
// New flow: SuperAdmin / LabAdmin create a user without setting a password.
// The system generates a secure token and emails an invite link so the
// invited user can create their own password (similar to SaaS products).
router.post('/invite-user', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const actor = req.user;
    const isSuperAdmin = actor.role === 'SuperAdmin';
    const isLabAdmin = !isSuperAdmin && (actor.role === 'LabAdmin' || actor.role === 'Admin');

    if (!isSuperAdmin && !isLabAdmin) {
      return res.status(403).json({ message: 'Only SuperAdmin or Lab Admin can invite users' });
    }

    const { username, email, role, firstName, lastName, phone } = req.body;

    // Normalize
    const emailNorm = String(email || '').trim().toLowerCase();
    const roleNorm = String(role || '').trim();
    const phoneNorm = String(phone || '').trim();

    if (!emailNorm || !roleNorm) {
      return res.status(400).json({ message: 'Email and role are required' });
    }

    // Lab Admin can create any custom role EXCEPT SuperAdmin or LabAdmin
    if (isLabAdmin) {
      const restrictedRoles = ['SuperAdmin', 'LabAdmin'];
      if (restrictedRoles.includes(roleNorm)) {
        return res.status(403).json({
          message: 'Lab Admin cannot create SuperAdmin or LabAdmin accounts'
        });
      }
    }

    // Check if user already exists by email or phone
    const orConds = [{ email: emailNorm }];
    if (phoneNorm) orConds.push({ phone: phoneNorm });

    const existingUser = await User.findOne({ $or: orConds });
    if (existingUser) {
      const which = existingUser.email === emailNorm ? 'email' : (existingUser.phone === phoneNorm ? 'phone' : 'email/phone');
      console.warn('🚫 Duplicate invite attempt:', { emailNorm, phoneNorm, matchedBy: which, existingId: existingUser._id?.toString() });
      return res.status(400).json({ message: `User with this ${which} already exists` });
    }

    // Auto username by role if needed
    let finalUsername = (username || '').trim();
    const roleLc = roleNorm.toLowerCase();
    if (!finalUsername) {
      if (roleLc === 'admin') finalUsername = 'admin';
      else if (roleLc === 'pathology') finalUsername = 'pathology';
      else if (roleLc === 'pharmacy') finalUsername = 'pharmacy';
      else finalUsername = (emailNorm.split('@')[0] || 'user').trim();
    }

    let lab = null;

    // For LabAdmin/Admin: enforce lab scope & subscription before creating staff users
    if (isLabAdmin) {
      if (!actor.labId) {
        return res.status(400).json({ message: 'Your account is not linked to any lab. Cannot invite users.' });
      }

      lab = await Lab.findById(actor.labId);
      if (!lab) {
        return res.status(404).json({ message: 'Lab not found for your account' });
      }

      // Enforce subscription validity and user count limits
      if (!lab.hasValidSubscription()) {
        return res.status(403).json({
          message: 'Your lab subscription is not active. Please renew or upgrade to add more users.',
          subscriptionStatus: lab.subscriptionStatus,
          subscriptionPlan: lab.subscriptionPlan,
          trialEndsAt: lab.trialEndsAt,
          subscriptionEndsAt: lab.subscriptionEndsAt
        });
      }

      if (!lab.canAddUser()) {
        const details = lab.planDetails || {};
        return res.status(403).json({
          message: 'Your current subscription plan user limit has been reached. Please upgrade your plan to add more users.',
          subscriptionPlan: lab.subscriptionPlan,
          subscriptionStatus: lab.subscriptionStatus,
          totalUsers: lab.totalUsers,
          maxUsers: details.maxUsers
        });
      }
    }

    // Generate a random placeholder password (never shown to user)
    const tempPassword = crypto.randomBytes(32).toString('hex');

    // Generate an invite token reusing the reset-password mechanism
    const token = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

    // Create new user (SuperAdmin: global, LabAdmin/Admin: lab-scoped)
    const user = new User({
      username: finalUsername,
      email: emailNorm,
      password: tempPassword,
      role: roleNorm,
      firstName,
      lastName,
      phone: phoneNorm,
      labId: isLabAdmin && lab ? lab._id : null,
      passwordResetToken: token,
      passwordResetExpires: tokenExpires
    });

    await user.save();

    // If created under a lab, increment lab user count
    if (isLabAdmin && lab) {
      lab.totalUsers = (lab.totalUsers || 0) + 1;
      await lab.save();
    }

    console.log('✅ Invite user created:', { id: user._id.toString(), email: user.email, role: user.role, labId: user.labId });

    const hospitalNameHi = 'सार्थक डायग्नोस्टिक नेटवर्क';
    const hospitalNameEn = 'Sarthak Diagnostic Network';
    const baseUrl = process.env.PUBLIC_URL || '';
    const inviteUrl = `${baseUrl}/auth/create-password?token=${token}`;

    const emailSubject = `${hospitalNameEn} - You have been invited`;
    const emailHtml = `
      <div style=\"font-family:Arial,sans-serif;font-size:14px;color:#111\">
        <p>Dear ${firstName || 'User'},</p>
        <p>You have been invited to access <b>${hospitalNameHi}</b> (${hospitalNameEn}).</p>
        <p><strong>Assigned Role:</strong> ${roleNorm}</p>
        <p><strong>Login ID (Email):</strong> ${emailNorm}</p>
        <p>To activate your account and create your password, please click the link below:</p>
        <p><a href="${inviteUrl}">Create your password</a></p>
        <p>This link will expire in 24 hours for your security.</p>
        <p>Regards,<br/>${(req.user && req.user.email) ? req.user.email : 'HMS System'}</p>
      </div>`;

    const adminDoc = await User.findById(req.user.userId);
    let emailSent = false;
    try {
      emailSent = await sendEmail({
        to: emailNorm,
        subject: emailSubject,
        text: `You have been invited to ${hospitalNameEn}. Use this link to create your password (valid 24 hours): ${inviteUrl}`,
        html: emailHtml,
        fromUser: adminDoc
      });
      console.log(emailSent ? '📧 Invite email sent (or queued)' : '📭 Invite email not sent (SMTP not configured).');
    } catch (err) {
      console.warn('📭 Invite email send skipped:', err?.message || err);
      emailSent = false;
    }

    return res.status(201).json({
      message: 'User invited successfully',
      user,
      emailSent: typeof emailSent !== 'undefined' ? !!emailSent : undefined
    });
  } catch (error) {
    if (error && (error.code === 11000 || error.name === 'MongoServerError')) {
      const fields = Object.keys(error.keyPattern || {});
      const which = fields.includes('email') ? 'email' : (fields.includes('phone') ? 'phone' : 'email/phone');
      return res.status(400).json({ message: `User with this ${which} already exists` });
    }
    console.error('❌ Invite user error:', error);
    return res.status(500).json({ message: error.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔄 Login attempt for:', email);

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // MongoDB authentication
    console.log('🔄 Authenticating user with MongoDB');

    // Normalize email to ensure case-insensitive lookup
    const emailNorm = String(email || '').trim().toLowerCase();
    // Normalize password to avoid leading/trailing space issues
    const passwordNorm = String(password || '').trim();

    // Normal database authentication
    const user = await User.findOne({ email: emailNorm }).populate('labId');
    console.log('👤 User found:', user ? 'YES' : 'NO');

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      console.log('❌ User account is deactivated');
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Verify password
    console.log('🔐 Verifying password...');
    const isPasswordValid = await user.comparePassword(passwordNorm);
    console.log('🔐 Password valid:', isPasswordValid ? 'YES' : 'NO');

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check lab approval status (for non-SuperAdmin users)
    if (user.role !== 'SuperAdmin' && user.labId) {
      const lab = user.labId;

      if (lab.approvalStatus === 'pending') {
        console.log('❌ Lab registration is pending approval');
        return res.status(403).json({
          message: 'Your lab registration is pending approval. Please wait for admin approval.',
          approvalStatus: 'pending'
        });
      }

      if (lab.approvalStatus === 'rejected') {
        console.log('❌ Lab registration has been rejected');
        return res.status(403).json({
          message: 'Your lab registration has been rejected. Please contact support.',
          approvalStatus: 'rejected',
          rejectionReason: lab.rejectionReason || 'No reason provided'
        });
      }

      // Check subscription status
      if (lab.subscriptionStatus !== 'active') {
        console.log('⚠️ Lab subscription is not active:', lab.subscriptionStatus);
        // Allow login but warn about subscription
      }
	    	
	    	  // Check trial expiry
	    	  if (lab.subscriptionPlan === 'trial' && lab.trialEndsAt) {
	    	    const trialEndsAt = new Date(lab.trialEndsAt);
	    	    if (trialEndsAt < new Date()) {
	    	      console.log('⚠️ Trial period has expired - marking subscription as expired but allowing login');
	    	      // Mark lab subscription as expired (so frontend guards can block modules)
	    	      if (lab.subscriptionStatus !== 'expired') {
	    	        try {
	    	          lab.subscriptionStatus = 'expired';
	    	          await lab.save();
	    	        } catch (e) {
	    	          console.warn('⚠️ Failed to update lab subscriptionStatus to expired on login:', e?.message || e);
	    	        }
	    	      }
	    	    }
	    	  }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token with fallback secret
    const jwtSecret = process.env.JWT_SECRET || 'hospital_management_secret_key_2025_secure_token';
    const jwtExpires = process.env.JWT_EXPIRES_IN || '24h';

    console.log('🔑 Generating JWT token...');
    const token = jwt.sign(
      { userId: user._id, role: user.role, labId: user.labId?._id },
      jwtSecret,
      { expiresIn: jwtExpires }
    );

    // Prepare lab info for response
    let labInfo = null;
    if (user.labId) {
      const lab = user.labId;
      labInfo = {
        _id: lab._id,
        labCode: lab.labCode,
        labName: lab.labName,
        email: lab.email,
        phone: lab.phone,
        subscriptionPlan: lab.subscriptionPlan,
        subscriptionStatus: lab.subscriptionStatus,
        approvalStatus: lab.approvalStatus,
        trialEndsAt: lab.trialEndsAt,
        subscriptionEndsAt: lab.subscriptionEndsAt
      };
    }

    console.log('✅ Login successful for:', email);
    res.json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        profilePicture: user.profilePicture,
        isActive: user.isActive,
        permissions: user.permissions,
        allowedRoutes: user.allowedRoutes || [],
        lab: labInfo,
        labSettings: user.labSettings || null
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Login failed: ' + error.message });
  }
});

// Update current user's profile (SuperAdmin only)
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can update profile' });
    }

    const userId = req.user.userId;
    const allowed = ['firstName', 'lastName', 'username', 'phone', 'email', 'password'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined && req.body[key] !== null && req.body[key] !== '') {
        update[key] = req.body[key];
      }
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Normalize inputs
    if (typeof update.email === 'string') {
      update.email = update.email.trim().toLowerCase();
    }
    if (typeof update.username === 'string') {
      update.username = update.username.trim();
    }

    // If email/username being changed, ensure uniqueness (case-insensitive for email)
    if (update.email && update.email !== user.email) {
      const exists = await User.findOne({ email: update.email, _id: { $ne: userId } });
      if (exists) return res.status(400).json({ message: 'Another account already uses this email' });
    }

    // Apply updates
    Object.assign(user, update);
    await user.save(); // will hash password if changed and assign permissions if role changed

    res.json({ message: 'Profile updated', user });
  } catch (error) {
    console.error('❌ Profile update error:', error);
    // Handle duplicate key errors gracefully
    if (error && error.code === 11000) {
      const key = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(400).json({ message: `${key} already exists` });
    }
    res.status(500).json({ message: error.message });
  }
});

// Upload current user's profile picture (SuperAdmin only)
router.post('/profile/picture', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can update profile pictures' });
    }
    if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
    const imageUrl = `/uploads/users/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(req.user.userId, { profilePicture: imageUrl }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Profile picture updated', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    // Get user from MongoDB
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Middleware to authenticate token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  // Use the same fallback secret used during login to avoid token mismatch in dev
  jwt.verify(token, process.env.JWT_SECRET || 'hospital_management_secret_key_2025_secure_token', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Change Password
router.put('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'hospital_management_secret_key_2025_secure_token');
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    user.updatedAt = new Date();
    await user.save();

    res.json({
      message: 'Password changed successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Forgot password - send email with token
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ message: 'If the email exists, a reset link has been sent' });

    // generate token
    const token = require('crypto').randomBytes(20).toString('hex');
    user.passwordResetToken = token;
    user.passwordResetExpires = new Date(Date.now() + 1000 * 60 * 15); // 15 min
    await user.save();

    const resetUrl = `${process.env.PUBLIC_URL || ''}/auth/reset-password?token=${token}`;
    const html = `<div style="font-family:Arial;color:#111">
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}">Click here</a> to reset your password. This link will expire in 15 minutes.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    </div>`;
    await sendEmail({ to: email, subject: 'Reset your HMS password', text: `Reset link: ${resetUrl}`, html });

    res.json({ message: 'If the email exists, a reset link has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset password with token (used by "Forgot password")
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: 'Invalid request' });
    const user = await User.findOne({ passwordResetToken: token, passwordResetExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ message: 'Invalid or expired token' });
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create password with invite token (first-time setup for invited users)
router.post('/create-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: 'Invalid request' });
    const user = await User.findOne({ passwordResetToken: token, passwordResetExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.isActive = true; // ensure invited user is active after setting password
    await user.save();

    res.json({ message: 'Password created successfully. You can now log in.' });
  } catch (error) {
    console.error('Create password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Request SuperAdmin approval for password reset (sends email)
router.post('/request-reset-approval', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ message: 'If the email exists, an approval request was sent' });

    // Find a SuperAdmin recipient
    const superAdmin = await User.findOne({ role: 'SuperAdmin' });
    const to = superAdmin?.email || process.env.SUPERADMIN_EMAIL || process.env.EMAIL_USER;

    const html = `<div style="font-family:Arial;color:#111">
      <p>User <b>${user.firstName || user.username}</b> (${user.email}) requested permission to reset password.</p>
      <p>If you approve, reply to this email or contact the user and perform reset from admin panel.</p>
    </div>`;
    await sendEmail({ to, subject: 'Password reset approval request', text: `Approval requested by ${user.email}`, html });

    res.json({ message: 'Request sent to SuperAdmin for approval' });
  } catch (error) {
    console.error('request-reset-approval error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset Admin Password (Emergency use only)
router.post('/reset-admin-password', async (req, res) => {
  try {
    const { newPassword, adminKey } = req.body;

    // Security check - only allow with special admin key
    if (adminKey !== process.env.ADMIN_RESET_KEY && adminKey !== 'EMERGENCY_RESET_2024') {
      return res.status(403).json({ message: 'Unauthorized admin reset attempt' });
    }

    // Find admin user
    const adminUser = await User.findOne({ role: 'Admin' });

    if (!adminUser) {
      return res.status(404).json({ message: 'Admin user not found' });
    }


    // Update admin password
    adminUser.password = newPassword;
    adminUser.updatedAt = new Date();
    await adminUser.save();

    return res.json({
      message: 'Admin password reset successfully',
      email: adminUser.email
    });

  } catch (error) {
    console.error('Admin password reset error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ================= SUPERADMIN USER MANAGEMENT =================
// Send a test email to verify SMTP (SuperAdmin only)
const sendTestEmailHandler = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can send test email' });
    }
    const to = (req.body && req.body.to) || req.user.email;
    const adminDoc = await User.findById(req.user.userId);
    const sent = await sendEmail({
      to,
      subject: 'HMS Test Email',
      text: 'This is a test email from HMS.',
      html: '<p>This is a <b>test email</b> from HMS.</p>',
      fromUser: adminDoc
    });
    return res.json({ success: !!sent, message: sent ? 'Email sent (or queued)' : 'Email not sent (SMTP not configured)' });
  } catch (error) {
    console.error('❌ test-email error:', error);
    return res.status(500).json({ message: error.message });
  }
};

router.post('/test-email', authenticateToken, sendTestEmailHandler);
// Backward-compatibility alias (handles any accidental "test-email1" calls)
router.post('/test-email1', authenticateToken, sendTestEmailHandler);


// List users
// - SuperAdmin/Admin: all users
// - LabAdmin with labId: users from their own lab only
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const actor = req.user;
    if (!actor) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (actor.role === 'SuperAdmin' || actor.role === 'Admin') {
      const users = await User.find({}).sort({ createdAt: -1 });
      return res.json({ users, total: users.length });
    }

    if (actor.role === 'LabAdmin' && actor.labId) {
      const users = await User.find({ labId: actor.labId }).sort({ createdAt: -1 });
      return res.json({ users, total: users.length });
    }

    return res.status(403).json({ message: 'Access denied. Only SuperAdmin/Admin or LabAdmin can view users.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Public: List users with limited fields (DEV/temporary)
// NOTE: Do not expose sensitive fields. Use only for read-only listing on All Roles page
router.get('/users-open', async (req, res) => {
  try {
    const users = await User.find({}, 'username email role firstName lastName phone isActive createdAt').sort({ createdAt: -1 });
    res.json({ users, total: users.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Update user (SuperAdmin only)
router.put('/users/:id', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can update users' });
    }
    const { id } = req.params;

    // Prepare update; allow SuperAdmin to set password explicitly
    const update = { ...req.body };
    const plainPassword = update.password ? String(update.password) : null;
    if (update.password) delete update.password; // we will set on doc to trigger hashing

    // Load existing doc first to detect role change and to set password
    const userDoc = await User.findById(id);
    if (!userDoc) return res.status(404).json({ message: 'User not found' });

    const prevRole = userDoc.role;
    const prevEmail = userDoc.email;

    // Validate and apply allowedRoutes if provided
    if (Object.prototype.hasOwnProperty.call(update, 'allowedRoutes')) {
      const val = update.allowedRoutes;
      if (val == null) {
        userDoc.allowedRoutes = [];
      } else if (Array.isArray(val)) {
        userDoc.allowedRoutes = val.filter(r => typeof r === 'string');
      } else {
        return res.status(400).json({ message: 'allowedRoutes must be an array of route strings' });
      }
      delete update.allowedRoutes;
    }

    // Apply other updates
    Object.assign(userDoc, update);
    if (plainPassword) {
      userDoc.password = plainPassword; // will hash on save
    }

    const roleChanged = update.role && update.role !== prevRole;
    const emailChanged = update.email && update.email !== prevEmail;

    await userDoc.save();

    // If role changed or password set, send notification email automatically
    let emailSent;
    if (roleChanged || !!plainPassword) {
      const hospitalNameHi = 'सार्थक डायग्नोस्टिक नेटवर्क';
      const hospitalNameEn = 'Sarthak Diagnostic Network';
      const emailSubject = roleChanged && plainPassword
        ? `${hospitalNameEn} - Role Updated & New Credentials`
        : roleChanged
          ? `${hospitalNameEn} - Role Updated`
          : `${hospitalNameEn} - Credentials Updated`;

      const emailHtml = `
        <div style=\"font-family:Arial,sans-serif;font-size:14px;color:#111\">
          <p>Dear ${userDoc.firstName || 'User'},</p>
          <p>Your access to <b>${hospitalNameHi}</b> (${hospitalNameEn}) has been ${roleChanged ? 'updated' : 'changed'} by SuperAdmin.</p>
          <p><strong>Assigned Role:</strong> ${userDoc.role}</p>
          <p><strong>Login ID (Email):</strong> ${userDoc.email}</p>
          ${plainPassword ? `<p><strong>Password:</strong> ${plainPassword}</p>` : ''}
          <p>For security, please change your password after first login (or after receiving new credentials).</p>
          <p>Regards,<br/>${(req.user && req.user.email) ? req.user.email : 'HMS System'}</p>
        </div>`;

      const adminDoc = await User.findById(req.user.userId);
      try {
        emailSent = await sendEmail({
          to: userDoc.email,
          subject: emailSubject,
          text: `Hospital: ${hospitalNameEn}\nRole: ${userDoc.role}\nLogin: ${userDoc.email}${plainPassword ? `\nPassword: ${plainPassword}` : ''}`,
          html: emailHtml,
          fromUser: adminDoc
        });
      } catch (e) {
        console.warn('📭 Update email send skipped:', e?.message || e);
        emailSent = false;
      }
    }

    res.json({ message: 'User updated', user: userDoc, emailSent: typeof emailSent !== 'undefined' ? !!emailSent : undefined });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a user's route access within the same lab (LabAdmin/Admin)
router.patch('/users/:id/routes', authenticateToken, async (req, res) => {
  try {
    const actor = req.user;
    if (!actor || !(actor.role === 'LabAdmin' || actor.role === 'Admin') || !actor.labId) {
      return res.status(403).json({ message: 'Only Lab Admin/Admin with lab context can update route access' });
    }

    const { id } = req.params;
    const userDoc = await User.findById(id);
    if (!userDoc) return res.status(404).json({ message: 'User not found' });

    if (!userDoc.labId || String(userDoc.labId) !== String(actor.labId)) {
      return res.status(403).json({ message: 'You can only manage users from your own lab' });
    }

    const { allowedRoutes } = req.body || {};
    if (!Array.isArray(allowedRoutes)) {
      return res.status(400).json({ message: 'allowedRoutes must be an array of route strings' });
    }

    userDoc.allowedRoutes = allowedRoutes.filter(r => typeof r === 'string');
    await userDoc.save();

    return res.json({ message: 'User route access updated', user: userDoc });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Explicit Active flag setter (SuperAdmin only)
router.patch('/users/:id/active', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can update users' });
    }
    const { id } = req.params;
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive boolean is required' });
    }
    const user = await User.findByIdAndUpdate(id, { isActive: !!isActive }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`, user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Toggle Active flag (SuperAdmin only)
router.patch('/users/:id/toggle-active', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can update users' });
    }
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isActive = !user.isActive;
    await user.save();
    return res.json({ message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`, user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Delete user (SuperAdmin only)
router.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can delete users' });
    }
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Upload/Update profile picture
router.post('/users/:id/profile-picture', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can update profile pictures' });
    }
    if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
    const { id } = req.params;
    const imageUrl = `/uploads/users/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(id, { profilePicture: imageUrl }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Profile picture updated', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});




// Safety re-register: Users list routes (in case earlier registration is skipped)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    if (!req.user || (req.user.role !== 'SuperAdmin' && req.user.role !== 'Admin')) {
      return res.status(403).json({ message: 'Only SuperAdmin/Admin can view users' });
    }
    const users = await User.find({}).sort({ createdAt: -1 });
    res.json({ users, total: users.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/users-open', async (req, res) => {
  try {
    const users = await User.find(
      {},
      'username email role firstName lastName phone isActive createdAt'
    ).sort({ createdAt: -1 });
    res.json({ users, total: users.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Debug: list registered auth routes (temporary helper)
router.get('/__routes', (req, res) => {
  try {
    const list = (router.stack || [])
      .filter((l) => l.route)
      .map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods) }));
    res.json({ routes: list });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'failed to list routes' });
  }
});

module.exports = router;
