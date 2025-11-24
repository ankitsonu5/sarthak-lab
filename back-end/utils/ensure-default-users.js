const User = require('../models/User');

// Ensure default critical users exist (idempotent)
// Reads credentials from env when provided, otherwise uses safe dev defaults
async function ensureDefaultUsers() {
  try {
    const defaults = [
      {
        role: 'SuperAdmin',
        email: process.env.SUPERADMIN_EMAIL || 'superadmin@pathologysaas.com',
        username: process.env.SUPERADMIN_USERNAME || 'superadmin',
        // Keep SuperAdmin password consistent across scripts and UI
        password: process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@123',
        firstName: 'Super',
        lastName: 'Admin',
        phone: '9999999990'
      },
      {
        role: 'Pathology',
        email: process.env.PATHOLOGY_EMAIL || 'pathology@hospital.com',
        username: process.env.PATHOLOGY_USERNAME || 'pathology',
        password: process.env.PATHOLOGY_PASSWORD || 'pathology123',
        firstName: 'Pathology',
        lastName: 'User',
        phone: '9999999992'
      }
    ];

    for (const def of defaults) {
      // Try to find by email OR username to avoid duplicate key errors
      let user = await User.findOne({ $or: [{ email: def.email }, { username: def.username }] });
      if (!user) {
        user = new User({
          username: def.username,
          email: def.email,
          password: def.password,
          role: def.role,
          firstName: def.firstName,
          lastName: def.lastName,
          phone: def.phone,
          isActive: true
        });
        await user.save();
        console.log(`✅ Created default ${def.role} user: ${def.email}`);
      } else {
        // Ensure role and active status; reset password to ensure known creds
        const updates = [];
        if (user.role !== def.role) { user.role = def.role; updates.push('role'); }
        if (!user.isActive) { user.isActive = true; updates.push('isActive'); }
        // Always ensure password matches defaults for easier testing
        user.password = def.password; updates.push('password');
        await user.save();
        console.log(`ℹ️ Default user ensured for role ${def.role}: ${user.email} (updated: ${updates.join(', ') || 'none'})`);
      }
    }

    // Ensure at least one Admin exists (legacy)
    const admin = await User.findOne({ role: 'Admin' });
    if (!admin) {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@hospital.com';
      const adminUser = new User({
        username: process.env.ADMIN_USERNAME || 'admin',
        email: adminEmail,
        password: process.env.ADMIN_PASSWORD || 'admin123',
        role: 'Admin',
        firstName: 'Admin',
        lastName: 'User',
        phone: '9999999999',
        isActive: true
      });
      await adminUser.save();
      console.log(`✅ Created default Admin user: ${adminEmail}`);
    }
  } catch (err) {
    console.error('❌ Error ensuring default users:', err.message);
  }
}

module.exports = { ensureDefaultUsers };

