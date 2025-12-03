
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const path = require('path');
const fs = require('fs');

const app = express();
// Allow overriding port from .env (defaults to 3000 to match Angular proxy)
const PORT = Number(process.env.PORT) || 3000;

// Middleware
// Add request logging middleware FIRST
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

app.use(cors());
const BODY_LIMIT = process.env.BODY_LIMIT || '10mb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// Serve static files for uploads
app.use('/uploads', express.static('uploads'));
app.use('/uploads', express.static('back-end/uploads'));

// Serve static files from Angular build (resolve best available dist path)
const candidateStaticRoots = [
  path.join(__dirname, 'back-end', 'dist', 'browser'),
  path.join(__dirname, 'dist', 'lab-management-system', 'browser'),
  path.join(__dirname, 'dist', 'browser'),
  path.join(__dirname, 'browser')
];
let staticRoot = null;
// Prefer STATIC_ROOT env if valid
if (process.env.STATIC_ROOT && fs.existsSync(path.join(process.env.STATIC_ROOT, 'index.html'))) {
  staticRoot = process.env.STATIC_ROOT;
}
// Otherwise pick first candidate that has index.html
if (!staticRoot) {
  staticRoot = candidateStaticRoots.find(p => fs.existsSync(path.join(p, 'index.html')));
}
if (!staticRoot) {
  // Fall back to first candidate to keep server running
  staticRoot = candidateStaticRoots[0];
  console.warn('⚠️ Could not find index.html in any candidate dist folder. Falling back to:', staticRoot);
} else {
  console.log('🗂️ Serving static Angular build from:', staticRoot);
}
app.use(express.static(staticRoot));

// Debug route to verify static root and file existence
app.get('/__static-check', (req, res) => {
  const sampleChunk = 'chunk-RQB2JUQQ.js';
  const exists = fs.existsSync(path.join(staticRoot, sampleChunk));
  res.json({ staticRoot, sampleChunk, exists, indexExists: fs.existsSync(path.join(staticRoot, 'index.html')) });
});
// Explicit handler for Angular chunk files (in case any middleware interferes)
app.get(/^\/chunk-[A-Za-z0-9]+\.js(\.map)?$/, (req, res) => {
  const requested = req.path.replace(/^\//, '');
  const filePath = path.join(staticRoot, requested);
  console.log(`📦 Serving chunk: ${filePath}`);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.warn(`❓ Could not serve chunk ${requested}:`, err?.code || err?.message);
      res.status(404).send('Not Found');
    }
  });
});


// Connect to MongoDB with retry logic
const connectDB = require('./back-end/config/database');
connectDB();

// Models will be imported through routes

// Ensure default critical users
const { ensureDefaultUsers } = require('./back-end/utils/ensure-default-users');
// One-time migration: ensure username is NOT unique (drop if exists)
(async () => {
  try {
    const coll = mongoose.connection?.db?.collection('users');
    if (coll) {
      const idx = await coll.indexes();
      const userNameIdx = idx.find(i => i.key && i.key.username && i.unique);
      if (userNameIdx) {
        try { await coll.dropIndex(userNameIdx.name); console.log('🧹 Dropped unique index on users.username'); } catch {}
      }
    }
  } catch (e) { console.warn('Index cleanup skipped:', e?.message); }
})();

ensureDefaultUsers();

// Import routes
const authRoutes = require('./back-end/routes/auth');
const doctorRoutes = require('./back-end/routes/doctors');
const departmentRoutes = require('./back-end/routes/departments');
const patientRoutes = require('./back-end/routes/patients');
const appointmentRoutes = require('./back-end/routes/appointments');
const prescriptionRoutes = require('./back-end/routes/prescriptions');
const reportRoutes = require('./back-end/routes/reports');
const roomRoutes = require('./back-end/routes/rooms');
const pathologyRoutes = require('./back-end/routes/pathology');
const pathologyBookingRoutes = require('./back-end/routes/pathologyBooking');
const pathologyInvoiceRoutes = require('./back-end/routes/pathologyInvoice');
const pathologyRegistrationRoutes = require('./back-end/routes/pathologyRegistration');
const pathologyMasterRoutes = require('./back-end/routes/pathologyMaster');
const pathologyReportsRoutes = require('./back-end/routes/pathologyReports');
const serviceHeadRoutes = require('./back-end/routes/serviceHeads');
const categoryHeadRoutes = require('./back-end/routes/categoryHeads');
const dashboardRoutes = require('./back-end/routes/dashboard');
const prefixRoutes = require('./back-end/routes/prefixes');
const inventoryRoutes = require('./back-end/routes/inventory');
const auditLogRoutes = require('./back-end/routes/auditLogs');

const selfRegistrationRoutes = require('./back-end/routes/selfRegistration');

// Multi-Tenant SaaS Routes
const labManagementRoutes = require('./back-end/routes/labManagement');
const subscriptionPlansRoutes = require('./back-end/routes/subscriptionPlans');

// 🏢 Multi-Tenant Middleware
const { authenticateToken } = require('./back-end/middlewares/auth');
const { multiTenantMiddleware } = require('./back-end/middleware/multiTenantMongo');


// Routes
// API health check route
app.get('/api/health', (req, res) => {
  res.json({ message: 'Lab Management System API is running!' });
});

// Test route
app.get('/test', (req, res) => {
  console.log('🧪 Test route accessed');
  res.json({
    message: 'Test successful!',
    timestamp: new Date().toISOString(),
    env: {
      JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
      MONGODB_URI: process.env.MONGODB_URI ? 'SET' : 'NOT SET'
    }
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/doctor-room-directory', require('./back-end/routes/doctor-room-directory'));
app.use('/api/departments', departmentRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/prescriptions', prescriptionRoutes);

app.use('/api/audit-logs', auditLogRoutes);

app.use('/api/reports', reportRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/pathology', pathologyRoutes);
app.use('/api/pathology-booking', pathologyBookingRoutes);
// 🏢 Multi-Tenant Protected Routes
app.use('/api/pathology-invoice', authenticateToken, multiTenantMiddleware, pathologyInvoiceRoutes);
app.use('/api/pathology-registration', authenticateToken, multiTenantMiddleware, pathologyRegistrationRoutes);
app.use('/api/pathology-master', pathologyMasterRoutes);
app.use('/api/pathology-reports', pathologyReportsRoutes);
app.use('/api/service-heads', serviceHeadRoutes);
app.use('/api/inventory', inventoryRoutes);

app.use('/api/prefixes', prefixRoutes);
app.use('/api/category-heads', categoryHeadRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use('/api/settings', require('./back-end/routes/smtp-settings'));
app.use('/api/settings', require('./back-end/routes/lab-settings'));
app.use('/api/self-registration', selfRegistrationRoutes);

app.use('/api/counter-management', require('./back-end/routes/counter-management'));

// Multi-Tenant SaaS Routes
app.use('/api/lab-management', labManagementRoutes);
app.use('/api/subscription-plans', subscriptionPlansRoutes);
app.use('/api/payments', require('./back-end/routes/payments'));

// All patient routes are handled by /api/patients routes

// Serve Angular app for root (after API/static routes)
app.get('/', (req, res) => res.sendFile(path.join(staticRoot, 'index.html')));

// SPA fallback: serve index.html only for real HTML navigations (not assets)
app.use((req,res,next)=>{
  const path=require('path');
  if(req.method!=='GET') return next();
  if(req.path.startsWith('/api/')||req.path.startsWith('/uploads/')||
     req.path.startsWith('/assets/')||req.path==='/favicon.ico') return next();
  if(req.path.includes('.')) return next();
  if(!((req.headers.accept||'').includes('text/html'))) return next();
  console.log(`🔄 SPA fallback -> ${req.path}`);
  res.sendFile(path.join(staticRoot,'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Minimal server running on port ${PORT}`);
  console.log(`🌐 API URL: http://localhost:${PORT}`);
  console.log(`🔑 JWT_SECRET: ${process.env.JWT_SECRET ? 'LOADED' : 'NOT LOADED'}`);
  console.log(`🗃️ MongoDB: ${process.env.MONGODB_URI ? 'SET' : 'NOT SET'}`);
  console.log(`🔗 Server listening on all interfaces (0.0.0.0:${PORT})`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!`);
  }
});

module.exports = app;
