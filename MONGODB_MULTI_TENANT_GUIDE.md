# Multi-Lab Pathology SaaS - MongoDB Implementation Guide

## 🎯 Overview

This guide explains how to transform your existing single-lab pathology system into a **Multi-Tenant SaaS Platform** using **MongoDB**.

---

## 🏗️ Architecture

### Multi-Tenancy Model: **Shared Database with Lab ID Isolation**

```
┌─────────────────────────────────────────────────────────────┐
│                  MongoDB Database                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Labs       │  │    Users     │  │   Patients   │      │
│  │              │  │              │  │              │      │
│  │ LAB00001     │  │ labId: L1    │  │ labId: L1    │      │
│  │ LAB00002     │  │ labId: L1    │  │ labId: L1    │      │
│  │ LAB00003     │  │ labId: L2    │  │ labId: L2    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Reports    │  │   Invoices   │  │  Bookings    │      │
│  │              │  │              │  │              │      │
│  │ labId: L1    │  │ labId: L1    │  │ labId: L1    │      │
│  │ labId: L2    │  │ labId: L2    │  │ labId: L2    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle**: Every document has a `labId` field that references the Lab collection.

---

## 📊 Database Schema Changes

### 1. New Collections

#### **Labs Collection**
```javascript
{
  _id: ObjectId,
  labCode: "LAB00001",           // Unique lab identifier
  labName: "ABC Diagnostics",
  email: "contact@abc.com",
  phone: "9876543210",
  address: "123 Street",
  city: "Mumbai",
  state: "Maharashtra",
  
  // Branding
  logoUrl: "https://...",
  primaryColor: "#007bff",
  
  // Subscription
  subscriptionPlan: "trial",     // trial, basic, premium
  subscriptionStatus: "active",  // pending, active, expired
  trialEndsAt: ISODate,
  
  // Approval
  approvalStatus: "approved",    // pending, approved, rejected
  approvedBy: ObjectId,
  approvedAt: ISODate,
  
  // Usage Stats
  totalPatients: 0,
  totalReports: 0,
  totalUsers: 1,
  monthlyReports: 0,
  
  // Settings
  settings: {
    printLayout: {...},
    prefixes: {...},
    numbering: {...}
  },
  
  createdAt: ISODate,
  updatedAt: ISODate
}
```

#### **SubscriptionPlans Collection**
```javascript
{
  _id: ObjectId,
  planName: "trial",
  displayName: "Trial Plan",
  priceMonthly: 0,
  priceYearly: 0,
  features: {
    maxUsers: 2,
    maxPatients: 50,
    maxReportsPerMonth: 100,
    trialDays: 14
  }
}
```

### 2. Updated Collections

#### **Users Collection** (Add labId field)
```javascript
{
  _id: ObjectId,
  labId: ObjectId,              // ← NEW: Reference to Labs collection (NULL for SuperAdmin)
  username: "admin",
  email: "admin@abc.com",
  password: "hashed",
  role: "LabAdmin",             // ← UPDATED: SuperAdmin, LabAdmin, Technician, Doctor, Receptionist
  permissions: [...],
  firstName: "John",
  lastName: "Doe",
  phone: "9876543210",
  isActive: true,
  createdAt: ISODate,
  updatedAt: ISODate
}
```

#### **Patients Collection** (Add labId field)
```javascript
{
  _id: ObjectId,
  labId: ObjectId,              // ← NEW: Reference to Labs collection
  patientId: "PAT000001",
  firstName: "Rajesh",
  lastName: "Kumar",
  age: 35,
  gender: "Male",
  phone: "9876543210",
  // ... other fields
}
```

#### **PathologyRegistrations Collection** (Add labId field)
```javascript
{
  _id: ObjectId,
  labId: ObjectId,              // ← NEW
  registrationNumber: "1",
  patientId: ObjectId,
  // ... other fields
}
```

#### **PathologyReports Collection** (Add labId field)
```javascript
{
  _id: ObjectId,
  labId: ObjectId,              // ← NEW
  receiptNo: "1/1",
  patientId: ObjectId,
  // ... other fields
}
```

#### **PathologyInvoices Collection** (Add labId field)
```javascript
{
  _id: ObjectId,
  labId: ObjectId,              // ← NEW
  invoiceNumber: "INV001",
  // ... other fields
}
```

---

## 🔐 Authentication & Authorization

### JWT Token Structure
```javascript
{
  userId: "user-id",
  email: "admin@abc.com",
  role: "LabAdmin",
  labId: "lab-id",              // NULL for SuperAdmin
  permissions: [...],
  subscriptionPlan: "trial",
  iat: 1234567890,
  exp: 1234567890
}
```

### Role Hierarchy

| Role | Lab Access | Description |
|------|-----------|-------------|
| **SuperAdmin** | All Labs | Platform administrator, approves labs |
| **LabAdmin** | Own Lab | Lab owner, full access to lab features |
| **Technician** | Own Lab | Create/edit reports |
| **Doctor** | Own Lab | View reports, add remarks |
| **Receptionist** | Own Lab | Register patients, create invoices |

---

## 🛠️ Implementation Steps

### Step 1: Create New Models

**Files Created:**
- `back-end/models/Lab.js` ✅
- `back-end/models/SubscriptionPlan.js` ✅

### Step 2: Update Existing Models

**Files to Update:**
- `back-end/models/User.js` ✅ (Added labId field)
- `back-end/models/Patient.js` ⏳ (Add labId field)
- `back-end/models/PathologyRegistration.js` ⏳ (Add labId field)
- `back-end/models/PathologyReport.js` ⏳ (Add labId field)
- `back-end/models/PathologyInvoice.js` ⏳ (Add labId field)

### Step 3: Create Multi-Tenant Middleware

**File Created:**
- `back-end/middleware/multiTenantMongo.js` ✅

**Features:**
- Automatic labId injection
- Subscription limit checking
- Lab ownership validation
- Super Admin bypass

### Step 4: Create Lab Management Routes

**File Created:**
- `back-end/routes/labManagement.js` ✅

**Endpoints:**
- `POST /api/lab-management/register` - Lab registration
- `GET /api/lab-management/labs` - List all labs (SuperAdmin)
- `GET /api/lab-management/my-lab` - Get current lab
- `PUT /api/lab-management/labs/:id/approve` - Approve lab
- `PUT /api/lab-management/labs/:id/reject` - Reject lab

### Step 5: Update Existing Routes

**Files to Update:**
- `back-end/routes/patients.js` ⏳ (Add multi-tenant middleware)
- `back-end/routes/pathologyRegistration.js` ⏳ (Add multi-tenant middleware)
- `back-end/routes/pathologyReports.js` ⏳ (Add multi-tenant middleware)
- `back-end/routes/pathologyInvoice.js` ⏳ (Add multi-tenant middleware)

---

## 🚀 Quick Start

### 1. Install Dependencies (Already installed)
```bash
cd back-end
npm install mongoose bcrypt jsonwebtoken
```

### 2. Seed Subscription Plans
```bash
node -e "
const mongoose = require('mongoose');
const SubscriptionPlan = require('./models/SubscriptionPlan');
require('./config/database')().then(async () => {
  await SubscriptionPlan.seedDefaultPlans();
  process.exit(0);
});
"
```

### 3. Create Super Admin
```bash
node -e "
const mongoose = require('mongoose');
const User = require('./models/User');
require('./config/database')().then(async () => {
  const admin = new User({
    labId: null,
    username: 'superadmin',
    email: 'superadmin@pathologysaas.com',
    password: 'SuperAdmin@123',
    role: 'SuperAdmin',
    firstName: 'Super',
    lastName: 'Admin',
    phone: '9999999999',
    isActive: true
  });
  await admin.save();
  console.log('✅ Super Admin created');
  process.exit(0);
});
"
```

### 4. Update server.js
```javascript
const labManagementRoutes = require('./routes/labManagement');

// Add route
app.use('/api/lab-management', labManagementRoutes);
```

### 5. Test Lab Registration
```bash
curl -X POST http://localhost:3000/api/lab-management/register \
  -H "Content-Type: application/json" \
  -d '{
    "labName": "ABC Diagnostics",
    "email": "contact@abc.com",
    "phone": "9876543210",
    "address": "123 Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "adminFirstName": "Rajesh",
    "adminLastName": "Kumar",
    "adminEmail": "admin@abc.com",
    "adminPhone": "9876543211",
    "password": "Test@123"
  }'
```

---

## 📝 Migration Strategy

### Option 1: Gradual Migration (Recommended)

1. **Keep existing data as Lab 1**
   ```javascript
   // Create first lab from existing data
   const firstLab = new Lab({
     labCode: 'LAB00001',
     labName: 'Sarthak Diagnostic Network',
     email: 'admin@sarthak.com',
     subscriptionPlan: 'premium',
     subscriptionStatus: 'active',
     approvalStatus: 'approved'
   });
   await firstLab.save();
   
   // Update all existing users
   await User.updateMany(
     { role: { $ne: 'SuperAdmin' } },
     { $set: { labId: firstLab._id } }
   );
   
   // Update all existing patients
   await Patient.updateMany({}, { $set: { labId: firstLab._id } });
   
   // Update all existing reports
   await PathologyReport.updateMany({}, { $set: { labId: firstLab._id } });
   ```

2. **New labs register independently**

### Option 2: Fresh Start

1. Backup existing database
2. Clear all collections
3. Start with multi-tenant structure

---

## 🔒 Security Considerations

### 1. Data Isolation
```javascript
// Always filter by labId
const patients = await Patient.find({ labId: req.labId });

// Use middleware helper
const patients = await Patient.find(getLabQuery(req));
```

### 2. Subscription Enforcement
```javascript
// Check limits before creating
router.post('/patients', 
  authenticateToken,
  multiTenantMiddleware,
  checkSubscriptionLimits('patients'),
  async (req, res) => {
    // Create patient
  }
);
```

### 3. Lab Ownership Validation
```javascript
// Validate before update/delete
router.put('/patients/:id',
  authenticateToken,
  multiTenantMiddleware,
  validateLabOwnership(Patient, 'id'),
  async (req, res) => {
    // Update patient
  }
);
```

---

## 📊 Subscription Plans

| Feature | Trial | Basic | Premium |
|---------|-------|-------|---------|
| **Price** | Free | ₹2,999/mo | ₹5,999/mo |
| **Duration** | 14 days | Monthly/Yearly | Monthly/Yearly |
| **Users** | 2 | 5 | Unlimited |
| **Patients** | 50 | 5,000 | Unlimited |
| **Reports/Month** | 100 | 1,000 | Unlimited |
| **Custom Branding** | ❌ | ✅ | ✅ |
| **API Access** | ❌ | ❌ | ✅ |
| **Priority Support** | ❌ | ❌ | ✅ |

---

## 🧪 Testing

### 1. Register Lab
```bash
POST /api/lab-management/register
```

### 2. Login as Super Admin
```bash
POST /api/auth/login
{
  "email": "superadmin@pathologysaas.com",
  "password": "SuperAdmin@123"
}
```

### 3. Approve Lab
```bash
PUT /api/lab-management/labs/{lab-id}/approve
Authorization: Bearer {super-admin-token}
```

### 4. Login as Lab Admin
```bash
POST /api/auth/login
{
  "email": "admin@abc.com",
  "password": "Test@123"
}
```

### 5. Create Patient (with lab isolation)
```bash
POST /api/patients
Authorization: Bearer {lab-admin-token}
{
  "firstName": "John",
  "lastName": "Doe",
  ...
}
```

---

## ✅ Next Steps

1. ✅ Create Lab and SubscriptionPlan models
2. ✅ Update User model with labId
3. ✅ Create multi-tenant middleware
4. ✅ Create lab management routes
5. ⏳ Update Patient model with labId
6. ⏳ Update PathologyRegistration model with labId
7. ⏳ Update PathologyReport model with labId
8. ⏳ Update existing routes with multi-tenant middleware
9. ⏳ Create Super Admin dashboard (Frontend)
10. ⏳ Create Lab registration page (Frontend)

---

**Status**: 🟢 **Backend Foundation Complete - Ready for Model Updates**

