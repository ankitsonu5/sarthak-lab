-- ============================================
-- Multi-Tenant Pathology SaaS Database Schema
-- Database: PostgreSQL 14+
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. LABS TABLE (Master table for all pathology labs)
-- ============================================
CREATE TABLE labs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  lab_name VARCHAR(255) NOT NULL,
  lab_code VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) DEFAULT 'India',
  pincode VARCHAR(10),
  
  -- Branding & Customization
  logo_url TEXT,
  side_logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#007bff',
  secondary_color VARCHAR(7) DEFAULT '#6c757d',
  header_note TEXT,
  footer_note TEXT,
  
  -- Subscription Management
  subscription_plan VARCHAR(20) DEFAULT 'trial' CHECK (subscription_plan IN ('trial', 'basic', 'premium')),
  subscription_status VARCHAR(20) DEFAULT 'pending' CHECK (subscription_status IN ('pending', 'active', 'suspended', 'cancelled', 'expired')),
  trial_ends_at TIMESTAMP,
  subscription_starts_at TIMESTAMP,
  subscription_ends_at TIMESTAMP,
  
  -- Approval Workflow
  approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID,
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  
  -- Usage Tracking
  total_patients INTEGER DEFAULT 0,
  total_reports INTEGER DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMP
);

-- Indexes for labs
CREATE INDEX idx_labs_status ON labs(approval_status, subscription_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_labs_code ON labs(lab_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_labs_email ON labs(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_labs_created ON labs(created_at DESC);

-- ============================================
-- 2. USERS TABLE (All users across all labs)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID REFERENCES labs(id) ON DELETE CASCADE, -- NULL for SuperAdmin
  
  -- Authentication
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  
  -- Profile
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  full_name VARCHAR(255) GENERATED ALWAYS AS (first_name || ' ' || COALESCE(last_name, '')) STORED,
  
  -- Role & Permissions
  role VARCHAR(50) NOT NULL CHECK (role IN ('SuperAdmin', 'LabAdmin', 'Technician', 'Doctor', 'Receptionist')),
  permissions JSONB DEFAULT '[]'::jsonb,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  email_verification_token VARCHAR(255),
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  
  -- Activity
  last_login TIMESTAMP,
  login_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Indexes for users
CREATE INDEX idx_users_lab ON users(lab_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active, lab_id);

-- ============================================
-- 3. PATIENTS TABLE (Lab-specific patients)
-- ============================================
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  
  -- Patient Info
  registration_number VARCHAR(50),
  patient_id VARCHAR(50), -- Lab-specific patient ID
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  full_name VARCHAR(255) GENERATED ALWAYS AS (first_name || ' ' || COALESCE(last_name, '')) STORED,
  
  -- Demographics
  age INTEGER,
  age_unit VARCHAR(10) DEFAULT 'years',
  gender VARCHAR(20) CHECK (gender IN ('Male', 'Female', 'Other')),
  date_of_birth DATE,
  
  -- Contact
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  
  -- Identification
  aadhaar VARCHAR(12),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  UNIQUE(lab_id, registration_number),
  UNIQUE(lab_id, patient_id)
);

-- Indexes for patients
CREATE INDEX idx_patients_lab ON patients(lab_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_phone ON patients(lab_id, phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_name ON patients(lab_id, full_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_reg_no ON patients(lab_id, registration_number) WHERE deleted_at IS NULL;

-- ============================================
-- 4. PATHOLOGY_REGISTRATIONS TABLE
-- ============================================
CREATE TABLE pathology_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  
  -- Registration Numbers
  receipt_number INTEGER,
  year_number INTEGER,
  today_number INTEGER,
  registration_date TIMESTAMP DEFAULT NOW(),
  
  -- Patient Snapshot (denormalized for reports)
  patient_data JSONB,
  
  -- Doctor & Department
  doctor_name VARCHAR(255),
  doctor_ref_no VARCHAR(100),
  department VARCHAR(100),
  referred_by VARCHAR(255),
  
  -- Tests (JSON array)
  tests JSONB DEFAULT '[]'::jsonb,
  samples_collected JSONB DEFAULT '[]'::jsonb,
  
  -- Payment
  total_amount DECIMAL(10, 2) DEFAULT 0,
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded')),
  payment_mode VARCHAR(50),
  
  -- Status
  status VARCHAR(50) DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'SAMPLE_COLLECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  
  -- Flags
  cash_edit_allowed BOOLEAN DEFAULT false,
  
  -- Remarks
  remarks TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  UNIQUE(lab_id, receipt_number)
);

-- Indexes for registrations
CREATE INDEX idx_registrations_lab ON pathology_registrations(lab_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_registrations_patient ON pathology_registrations(patient_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_registrations_receipt ON pathology_registrations(lab_id, receipt_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_registrations_status ON pathology_registrations(lab_id, status);
CREATE INDEX idx_registrations_date ON pathology_registrations(lab_id, registration_date DESC);

-- ============================================
-- 5. PATHOLOGY_REPORTS TABLE
-- ============================================
CREATE TABLE pathology_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  registration_id UUID REFERENCES pathology_registrations(id) ON DELETE SET NULL,
  
  -- Report Identification
  report_id VARCHAR(50),
  receipt_no VARCHAR(50),
  lab_yearly_no VARCHAR(50),
  lab_daily_no VARCHAR(50),
  
  -- Patient Data (snapshot)
  patient_data JSONB,
  
  -- Test Results
  test_results JSONB DEFAULT '[]'::jsonb,
  
  -- Report Details
  report_date DATE,
  report_type VARCHAR(50) DEFAULT 'pathology',
  
  -- Doctor
  referred_by VARCHAR(255),
  doctor_name VARCHAR(255),
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'delivered')),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Indexes for reports
CREATE INDEX idx_reports_lab ON pathology_reports(lab_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_receipt ON pathology_reports(lab_id, receipt_no) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_date ON pathology_reports(lab_id, report_date DESC);
CREATE INDEX idx_reports_registration ON pathology_reports(registration_id) WHERE deleted_at IS NULL;

-- ============================================
-- 6. PATHOLOGY_INVOICES TABLE
-- ============================================
CREATE TABLE pathology_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  
  -- Invoice Details
  receipt_number INTEGER,
  invoice_date TIMESTAMP DEFAULT NOW(),
  
  -- Patient Info (snapshot)
  patient_data JSONB,
  
  -- Items
  items JSONB DEFAULT '[]'::jsonb,
  
  -- Amounts
  subtotal DECIMAL(10, 2) DEFAULT 0,
  discount DECIMAL(10, 2) DEFAULT 0,
  tax DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) DEFAULT 0,
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  
  -- Payment
  payment_status VARCHAR(20) DEFAULT 'pending',
  payment_mode VARCHAR(50),
  
  -- Type
  patient_type VARCHAR(20) CHECK (patient_type IN ('OPD', 'IPD')),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  UNIQUE(lab_id, receipt_number)
);

-- Indexes for invoices
CREATE INDEX idx_invoices_lab ON pathology_invoices(lab_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_patient ON pathology_invoices(patient_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_receipt ON pathology_invoices(lab_id, receipt_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_date ON pathology_invoices(lab_id, invoice_date DESC);

-- ============================================
-- 7. SUBSCRIPTION_PLANS TABLE
-- ============================================
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Plan Details
  plan_name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Pricing
  price_monthly DECIMAL(10, 2) DEFAULT 0,
  price_yearly DECIMAL(10, 2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'INR',

  -- Features & Limits (JSON)
  features JSONB DEFAULT '{}'::jsonb,
  -- Example: {"max_users": 5, "max_patients": 1000, "max_reports_per_month": 500, "trial_days": 14}

  -- Status
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed subscription plans
INSERT INTO subscription_plans (plan_name, display_name, description, price_monthly, price_yearly, features, sort_order) VALUES
('trial', 'Trial Plan', '14-day free trial with limited features', 0, 0,
 '{"max_users": 2, "max_patients": 50, "max_reports_per_month": 100, "trial_days": 14, "features": ["Basic Reports", "Patient Management", "Email Support"]}'::jsonb, 1),
('basic', 'Basic Plan', 'Perfect for small labs', 2999, 29990,
 '{"max_users": 5, "max_patients": 5000, "max_reports_per_month": 1000, "features": ["All Trial Features", "Custom Branding", "5 Staff Users", "Priority Support"]}'::jsonb, 2),
('premium', 'Premium Plan', 'Unlimited features for growing labs', 5999, 59990,
 '{"max_users": -1, "max_patients": -1, "max_reports_per_month": -1, "features": ["All Basic Features", "Unlimited Users", "Unlimited Patients", "Advanced Analytics", "API Access", "24/7 Support"]}'::jsonb, 3);

-- ============================================
-- 8. SUBSCRIPTION_HISTORY TABLE
-- ============================================
CREATE TABLE subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,

  -- Subscription Details
  plan_name VARCHAR(50) NOT NULL,
  billing_cycle VARCHAR(20) CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount DECIMAL(10, 2),

  -- Period
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,

  -- Payment
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_method VARCHAR(50),
  transaction_id VARCHAR(255),

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscription_history_lab ON subscription_history(lab_id, created_at DESC);

-- ============================================
-- 9. AUDIT_LOGS TABLE (Track all important actions)
-- ============================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID REFERENCES labs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Action Details
  action VARCHAR(100) NOT NULL, -- e.g., 'CREATE_PATIENT', 'UPDATE_REPORT', 'DELETE_USER'
  entity_type VARCHAR(50), -- e.g., 'patient', 'report', 'user'
  entity_id UUID,

  -- Changes (JSON)
  old_values JSONB,
  new_values JSONB,

  -- Request Info
  ip_address INET,
  user_agent TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_lab ON audit_logs(lab_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- ============================================
-- 10. PATHOLOGY_TEST_MASTER TABLE (Lab-specific test definitions)
-- ============================================
CREATE TABLE pathology_test_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID REFERENCES labs(id) ON DELETE CASCADE, -- NULL for global templates

  -- Test Details
  test_name VARCHAR(255) NOT NULL,
  test_code VARCHAR(50),
  category VARCHAR(100),

  -- Parameters (JSON array)
  parameters JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"name": "Hemoglobin", "unit": "g/dL", "normalRange": "13-17"}]

  -- Pricing
  price DECIMAL(10, 2) DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_template BOOLEAN DEFAULT false, -- Global template vs lab-specific

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_test_master_lab ON pathology_test_master(lab_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_master_category ON pathology_test_master(lab_id, category) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_master_active ON pathology_test_master(lab_id, is_active) WHERE deleted_at IS NULL;

-- ============================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all multi-tenant tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathology_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathology_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathology_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathology_test_master ENABLE ROW LEVEL SECURITY;

-- Example RLS Policy for patients (apply similar for other tables)
CREATE POLICY patients_isolation_policy ON patients
  USING (lab_id = current_setting('app.current_lab_id')::uuid);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_labs_updated_at BEFORE UPDATE ON labs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_registrations_updated_at BEFORE UPDATE ON pathology_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON pathology_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON pathology_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_test_master_updated_at BEFORE UPDATE ON pathology_test_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: Create Super Admin User
-- ============================================

INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, email_verified)
VALUES (
  'superadmin@pathologysa as.com',
  -- Password: SuperAdmin@123 (hash this properly in production)
  '$2b$10$rQZ9vZ9Z9Z9Z9Z9Z9Z9Z9eXAMPLEHASH',
  'Super',
  'Admin',
  'SuperAdmin',
  true,
  true
) ON CONFLICT (email) DO NOTHING;

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- Lab Statistics View
CREATE OR REPLACE VIEW lab_statistics AS
SELECT
  l.id AS lab_id,
  l.lab_name,
  l.subscription_plan,
  l.subscription_status,
  COUNT(DISTINCT u.id) AS total_users,
  COUNT(DISTINCT p.id) AS total_patients,
  COUNT(DISTINCT pr.id) AS total_registrations,
  COUNT(DISTINCT rep.id) AS total_reports,
  COALESCE(SUM(pi.total_amount), 0) AS total_revenue,
  l.created_at AS lab_created_at
FROM labs l
LEFT JOIN users u ON u.lab_id = l.id AND u.deleted_at IS NULL
LEFT JOIN patients p ON p.lab_id = l.id AND p.deleted_at IS NULL
LEFT JOIN pathology_registrations pr ON pr.lab_id = l.id AND pr.deleted_at IS NULL
LEFT JOIN pathology_reports rep ON rep.lab_id = l.id AND rep.deleted_at IS NULL
LEFT JOIN pathology_invoices pi ON pi.lab_id = l.id AND pi.deleted_at IS NULL
WHERE l.deleted_at IS NULL
GROUP BY l.id;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE labs IS 'Master table for all pathology labs in the SaaS platform';
COMMENT ON TABLE users IS 'All users across all labs, including SuperAdmin';
COMMENT ON TABLE patients IS 'Lab-specific patient records with lab_id isolation';
COMMENT ON TABLE pathology_registrations IS 'Patient registration and test booking records';
COMMENT ON TABLE pathology_reports IS 'Generated pathology test reports';
COMMENT ON TABLE subscription_plans IS 'Available subscription plans (Trial, Basic, Premium)';
COMMENT ON TABLE audit_logs IS 'Audit trail for all important actions in the system';

-- ============================================
-- END OF SCHEMA
-- ============================================

