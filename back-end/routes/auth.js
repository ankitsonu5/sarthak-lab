const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
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

// Register new user (restricted to SuperAdmin)
router.post('/register', authenticateToken, async (req, res) => {
  try {
    // Only SuperAdmin can register new users
    if (!req.user || req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can create users' });
    }

    const { username, email, password, role, firstName, lastName, phone } = req.body;

    // Normalize
    const emailNorm = String(email || '').trim().toLowerCase();
    const roleNorm = String(role || '').trim();
    const phoneNorm = String(phone || '').trim();

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

    // Create new user
    const user = new User({
      username: finalUsername,
      email: emailNorm,
      password,
      role: roleNorm,
      firstName,
      lastName,
      phone: phoneNorm
    });

    await user.save();
    console.log('✅ User saved to DB:', { id: user._id.toString(), email: user.email, role: user.role });

    // Try to send credentials to the user's email (best-effort)
    const plainPassword = password; // We received plain password in req body
    const hospitalNameHi = 'राजकीय आयुर्वेद महाविद्यालय एवं चिकित्सालय';
    const hospitalNameEn = 'Rajkiya Ayurveda College and Hospital, Varanasi';
    const emailSubject = `${hospitalNameEn} - Account Created & Role Assigned`;
    const emailHtml = `
      <div style=\"font-family:Arial,sans-serif;font-size:14px;color:#111\">
        <p>Dear ${firstName || 'User'},</p>
        <p>Your access to <b>${hospitalNameHi}</b> (${hospitalNameEn}) has been created.</p>
        <p><strong>Assigned Role:</strong> ${role}</p>
        <p><strong>Login ID (Email):</strong> ${email}<br/>
           <strong>Password:</strong> ${plainPassword}</p>
        <p>For security, please change your password after first login.</p>
        <p>Regards,<br/>${(req.user && req.user.email) ? req.user.email : 'HMS System'}</p>
      </div>`;
    // Will use SuperAdmin's SMTP if configured, else global env
    const adminDoc = await User.findById(req.user.userId);
    let emailSent = false;
    try {
      emailSent = await sendEmail({ to: email, subject: emailSubject, text: `Hospital: ${hospitalNameEn}\nRole: ${role}\nLogin: ${email}\nPassword: ${plainPassword}`, html: emailHtml, fromUser: adminDoc });
      console.log(emailSent ? '📧 Welcome email sent (or queued)' : '📭 Welcome email not sent (SMTP not configured).');
    } catch (err) {
      console.warn('📭 Email send skipped:', err?.message || err);
      emailSent = false;
    }

    // Generate JWT token
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

    // Normal database authentication
    const user = await User.findOne({ email });
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
    const isPasswordValid = await user.comparePassword(password);
    console.log('🔐 Password valid:', isPasswordValid ? 'YES' : 'NO');

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token with fallback secret
    const jwtSecret = process.env.JWT_SECRET || 'hospital_management_secret_key_2025_secure_token';
    const jwtExpires = process.env.JWT_EXPIRES_IN || '24h';

    console.log('🔑 Generating JWT token...');
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      jwtSecret,
      { expiresIn: jwtExpires }
    );

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
        allowedRoutes: user.allowedRoutes || []
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

// Reset password with token
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


// List all users (SuperAdmin only)
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
      const hospitalNameHi = 'राजकीय आयुर्वेद महाविद्यालय एवं चिकित्सालय';
      const hospitalNameEn = 'Rajkiya Ayurveda College and Hospital, Varanasi';
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
