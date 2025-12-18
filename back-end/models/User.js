const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  // Multi-tenant field - NULL for SuperAdmin, required for all other users
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    default: null,
    index: true
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    required: true,
    trim: true
    // No enum restriction - Lab Admin can create any custom role
  },
  permissions: [{
    type: String,
    enum: [
      // Special permissions
      'all', // Admin has all permissions
      // Admin permissions
      'manage_users', 'manage_doctors', 'manage_patients', 'manage_appointments',
      'manage_reports', 'manage_prescriptions', 'view_all_data', 'manage_system',
      // Doctor permissions
      'view_patients', 'view_appointments', 'create_prescriptions', 'create_reports',
      'view_medical_history', 'update_appointments',
      // Patient permissions
      'view_own_appointments', 'view_own_prescriptions', 'view_own_reports',
      'update_own_profile',
      // Pathology permissions
      'manage_pathology', 'view_lab_tests', 'create_lab_reports', 'manage_lab_results',
      'manage_test_categories', 'generate_lab_invoices', 'manage_lab_settings',
    ]
  }],
  // Optional fine-grained UI access control by route
  allowedRoutes: [{ type: String }],
  firstName: {
    type: String,
    required: false,
    trim: true
  },
  lastName: {
    type: String,
    required: false,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  profilePicture: {
    type: String
  },
  // Optional per-user SMTP settings (sender = this user's email)
  smtpSettings: {
    host: { type: String },
    port: { type: Number },
    secure: { type: Boolean }, // true for 465, false for 587/STARTTLS

    user: { type: String },
    passEnc: { type: String }, // encrypted password/app password
    from: { type: String } // e.g., "RAMCAH HMS <name@domain>"
  },

  // Optional per-user Lab Setup (multi-lab ready: each account defines its own)
  labSettings: {
    labName: { type: String },
    shortName: { type: String },
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    phone: { type: String },
    altPhone: { type: String },
    email: { type: String },
    website: { type: String },
    logoDataUrl: { type: String },
    signatureDataUrl: { type: String },
    headerNote: { type: String },
    footerNote: { type: String },
    reportDisclaimer: { type: String },
    prefixes: {
      receipt: { type: String },
      report: { type: String },
      labYearlyPrefix: { type: String },
      labDailyPrefix: { type: String }
    },
    numbering: {
      receiptStart: { type: Number, default: 1 },
      reportStart: { type: Number, default: 1 },
      resetRule: { type: String, enum: ['yearly', 'monthly', 'never'], default: 'yearly' }
    },
    printLayout: {
      template: { type: String, enum: ['classic', 'compact', 'minimal'], default: 'classic' },
      showHeader: { type: Boolean, default: true },
      showFooter: { type: Boolean, default: true },
      showQr: { type: Boolean, default: false },
      showRefDoctor: { type: Boolean, default: true },
      showAmount: { type: Boolean, default: true }
    },
    updatedAt: { type: Date }
  },

  // Password reset fields
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date }
}, {
  timestamps: true
});

// Assign role-based permissions
const assignRolePermissions = (role) => {
  const rolePermissions = {
    'SuperAdmin': [
      'all'
    ],
    'LabAdmin': [
      'manage_users', 'manage_doctors', 'manage_patients', 'manage_appointments',
      'manage_reports', 'manage_prescriptions', 'view_all_data', 'manage_system',
      'manage_pathology', 'view_lab_tests', 'create_lab_reports', 'manage_lab_results',
      'manage_test_categories', 'generate_lab_invoices', 'manage_lab_settings'
    ],
    'Admin': [
      'manage_users', 'manage_doctors', 'manage_patients', 'manage_appointments',
      'manage_reports', 'manage_prescriptions', 'view_all_data', 'manage_system'
    ],
    'Technician': [
      'view_patients', 'manage_pathology', 'view_lab_tests', 'create_lab_reports',
      'manage_lab_results', 'generate_lab_invoices'
    ],
    'Doctor': [
      'view_patients', 'view_appointments', 'create_prescriptions', 'create_reports',
      'view_medical_history', 'update_appointments'
    ],
    'Receptionist': [
      'view_patients', 'manage_patients', 'manage_appointments', 'view_lab_tests',
      'generate_lab_invoices'
    ],
    'Patient': [
      'view_own_appointments', 'view_own_prescriptions', 'view_own_reports',
      'update_own_profile'
    ],
    'Pathology': [
      'manage_pathology', 'view_lab_tests', 'create_lab_reports', 'manage_lab_results',
      'view_patients', 'manage_test_categories', 'generate_lab_invoices'
	    ],
	    'Pharmacy': [
	      'view_patients', 'manage_prescriptions', 'generate_lab_invoices'
	    ]
  };
  return rolePermissions[role] || [];
};

// Hash password and assign permissions before saving
userSchema.pre('save', async function(next) {
  // Assign permissions based on role
  if (this.isModified('role') || this.isNew) {
    this.permissions = assignRolePermissions(this.role);
  }

  // Hash password if modified
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if user has specific permission
userSchema.methods.hasPermission = function(permission) {
  // SuperAdmin/Admin have ALL permissions
  if (this.role === 'Admin' || this.role === 'SuperAdmin') return true;

  // Check for 'all' permission
  if (this.permissions.includes('all')) return true;

  return this.permissions.includes(permission);
};

// Check if user has any of the specified permissions
userSchema.methods.hasAnyPermission = function(permissions) {
  // SuperAdmin/Admin have ALL permissions
  if (this.role === 'Admin' || this.role === 'SuperAdmin') return true;

  // Check for 'all' permission
  if (this.permissions.includes('all')) return true;

  return permissions.some(permission => this.permissions.includes(permission));
};

// Check if user can access resource based on ownership
userSchema.methods.canAccessResource = function(resourceOwnerId, requiredPermission) {
  // SuperAdmin/Admin can access everything
  if (this.role === 'Admin' || this.role === 'SuperAdmin') return true;

  // Check if user has the required permission
  if (!this.hasPermission(requiredPermission)) return false;

  // For patients, they can only access their own resources
  if (this.role === 'Patient') {
    return this._id.toString() === resourceOwnerId.toString();
  }

  // Doctors can access based on their permissions
  return true;
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};


module.exports = mongoose.model('User', userSchema);
