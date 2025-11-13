# Multi-Lab Pathology SaaS Architecture

## 🎯 Overview
Transform the current single-lab system into a **multi-tenant SaaS platform** where multiple pathology labs can register, manage their operations independently, and subscribe to different plans.

---

## 🏗️ Architecture Design

### **Multi-Tenancy Model: Shared Database with Lab Isolation**

```
┌─────────────────────────────────────────────────────────────┐
│                     SUPER ADMIN LAYER                        │
│  - Lab Approval/Rejection                                    │
│  - Subscription Management (Trial/Basic/Premium)             │
│  - Global Analytics & Monitoring                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  - JWT Authentication with lab_id in token                   │
│  - Role-Based Access Control (RBAC)                          │
│  - Multi-tenant Middleware (auto-inject lab_id filter)       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER (PostgreSQL)               │
│  - All tables have lab_id column                             │
│  - Row-Level Security (RLS) for data isolation               │
│  - Indexes on (lab_id, created_at) for performance           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Schema (PostgreSQL)

### **Core Tables**

#### **1. labs** (Master table for all pathology labs)
```sql
CREATE TABLE labs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_name VARCHAR(255) NOT NULL,
  lab_code VARCHAR(50) UNIQUE NOT NULL, -- e.g., "LAB001"
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) DEFAULT 'India',
  
  -- Branding
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#007bff',
  secondary_color VARCHAR(7) DEFAULT '#6c757d',
  header_note TEXT,
  footer_note TEXT,
  
  -- Subscription
  subscription_plan VARCHAR(20) DEFAULT 'trial', -- trial, basic, premium
  subscription_status VARCHAR(20) DEFAULT 'pending', -- pending, active, suspended, cancelled
  trial_ends_at TIMESTAMP,
  subscription_starts_at TIMESTAMP,
  subscription_ends_at TIMESTAMP,
  
  -- Approval
  approval_status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_labs_status ON labs(approval_status, subscription_status);
CREATE INDEX idx_labs_code ON labs(lab_code);
```

#### **2. users** (All users across all labs)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID REFERENCES labs(id) ON DELETE CASCADE, -- NULL for super admin
  
  -- Authentication
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  
  -- Profile
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) NOT NULL, -- SuperAdmin, LabAdmin, Technician, Doctor, Receptionist
  
  -- Permissions (JSON array)
  permissions JSONB DEFAULT '[]',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  last_login TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_lab ON users(lab_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

#### **3. patients** (Lab-specific patients)
```sql
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  
  -- Patient Info
  registration_number VARCHAR(50),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  age INTEGER,
  gender VARCHAR(20),
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  aadhaar VARCHAR(12),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(lab_id, registration_number)
);

CREATE INDEX idx_patients_lab ON patients(lab_id, created_at DESC);
CREATE INDEX idx_patients_phone ON patients(lab_id, phone);
```

#### **4. pathology_registrations** (Lab-specific registrations)
```sql
CREATE TABLE pathology_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id),
  
  -- Registration Details
  receipt_number INTEGER,
  year_number INTEGER,
  today_number INTEGER,
  registration_date TIMESTAMP DEFAULT NOW(),
  
  -- Patient snapshot (denormalized for reports)
  patient_data JSONB,
  
  -- Doctor & Department
  doctor_name VARCHAR(255),
  doctor_ref_no VARCHAR(100),
  department VARCHAR(100),
  
  -- Tests
  tests JSONB, -- Array of test objects
  
  -- Payment
  total_amount DECIMAL(10, 2),
  paid_amount DECIMAL(10, 2),
  payment_status VARCHAR(20) DEFAULT 'pending',
  
  -- Status
  status VARCHAR(50) DEFAULT 'REGISTERED',
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(lab_id, receipt_number)
);

CREATE INDEX idx_registrations_lab ON pathology_registrations(lab_id, created_at DESC);
CREATE INDEX idx_registrations_patient ON pathology_registrations(patient_id);
```

#### **5. pathology_reports** (Lab-specific reports)
```sql
CREATE TABLE pathology_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  registration_id UUID REFERENCES pathology_registrations(id),
  
  -- Report Details
  report_id VARCHAR(50),
  receipt_no VARCHAR(50),
  patient_data JSONB,
  test_results JSONB,
  report_date DATE,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reports_lab ON pathology_reports(lab_id, created_at DESC);
CREATE INDEX idx_reports_receipt ON pathology_reports(lab_id, receipt_no);
```

#### **6. subscription_plans** (Plan definitions)
```sql
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name VARCHAR(50) UNIQUE NOT NULL, -- trial, basic, premium
  display_name VARCHAR(100),
  price_monthly DECIMAL(10, 2),
  price_yearly DECIMAL(10, 2),
  
  -- Features (JSON)
  features JSONB, -- { max_users: 5, max_patients: 1000, max_reports_per_month: 500 }
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed data
INSERT INTO subscription_plans (plan_name, display_name, price_monthly, price_yearly, features) VALUES
('trial', 'Trial Plan', 0, 0, '{"max_users": 2, "max_patients": 50, "max_reports_per_month": 100, "trial_days": 14}'),
('basic', 'Basic Plan', 2999, 29990, '{"max_users": 5, "max_patients": 5000, "max_reports_per_month": 1000}'),
('premium', 'Premium Plan', 5999, 59990, '{"max_users": -1, "max_patients": -1, "max_reports_per_month": -1}');
```

---

## 🔐 Authentication & Authorization

### **JWT Token Structure**
```json
{
  "userId": "uuid",
  "labId": "uuid",
  "role": "LabAdmin",
  "email": "admin@lab.com",
  "permissions": ["manage_patients", "view_reports"],
  "subscriptionPlan": "premium",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### **Role Hierarchy**
```
SuperAdmin (no lab_id)
  ├─ Approve/Reject labs
  ├─ Manage subscription plans
  ├─ View all labs analytics
  └─ Cannot access lab-specific data

LabAdmin (has lab_id)
  ├─ Manage lab staff
  ├─ Manage patients
  ├─ View all reports
  ├─ Manage billing
  └─ Customize branding

Technician (has lab_id)
  ├─ Create reports
  ├─ Update test results
  └─ View assigned tests

Doctor (has lab_id)
  ├─ View reports
  └─ Add remarks

Receptionist (has lab_id)
  ├─ Register patients
  ├─ Create invoices
  └─ View reports
```

---

## 🛡️ Multi-Tenant Middleware (Backend)

### **Automatic lab_id Injection**
```javascript
// middleware/multiTenant.js
const multiTenantMiddleware = (req, res, next) => {
  const user = req.user; // From JWT
  
  // Super Admin bypass
  if (user.role === 'SuperAdmin') {
    return next();
  }
  
  // Inject lab_id into all queries
  req.labId = user.labId;
  
  // Add to query filters automatically
  req.query.lab_id = user.labId;
  
  next();
};
```

---

## 📱 Frontend Architecture

### **Routing Strategy**
```
/auth/login                    → Login (detect role, redirect)
/auth/register-lab             → Lab registration form
/super-admin/dashboard         → Super admin dashboard
/super-admin/labs              → Lab approval list
/super-admin/analytics         → Global analytics

/lab/dashboard                 → Lab-specific dashboard
/lab/patients                  → Patient management
/lab/reports                   → Report management
/lab/settings                  → Lab branding & settings
/lab/billing                   → Subscription & billing
```

### **Route Guards**
- `SuperAdminGuard` → Only SuperAdmin
- `LabGuard` → Any lab user (LabAdmin, Technician, etc.)
- `RoleGuard` → Specific roles (e.g., only LabAdmin)

---

## 🚀 Implementation Phases

### **Phase 1: Database Migration (PostgreSQL)**
- Set up PostgreSQL
- Create multi-tenant schema
- Migrate existing MongoDB data

### **Phase 2: Backend Core**
- JWT authentication with lab_id
- Multi-tenant middleware
- Lab registration & approval APIs

### **Phase 3: Super Admin Panel**
- Lab approval workflow
- Subscription management
- Analytics dashboard

### **Phase 4: Lab Portal**
- Lab-specific dashboard
- Branding customization
- Patient/Report management

### **Phase 5: Subscription & Billing**
- Plan restrictions
- Payment gateway integration
- Usage tracking

---

## 📈 Scalability Considerations

1. **Database Partitioning**: Partition tables by lab_id for large datasets
2. **Caching**: Redis for session management and frequently accessed data
3. **CDN**: Store lab logos and assets on CDN
4. **Load Balancing**: Horizontal scaling with multiple Node.js instances
5. **Database Replication**: PostgreSQL read replicas for analytics

---

## 🔒 Security Measures

1. **Row-Level Security (RLS)**: PostgreSQL policies to enforce lab_id filtering
2. **API Rate Limiting**: Per-lab rate limits based on subscription plan
3. **Data Encryption**: Encrypt sensitive patient data at rest
4. **Audit Logs**: Track all data access and modifications
5. **GDPR Compliance**: Data export and deletion capabilities

---

**Next Steps**: Start with PostgreSQL setup and schema creation.

