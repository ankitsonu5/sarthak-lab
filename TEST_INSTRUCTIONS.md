# 🎉 TESTING INSTRUCTIONS - Role-Based Dashboards

## ✅ Changes Implemented:

### 1. **Auto-Approve New Labs with 30-Day Free Trial**
- New labs are automatically approved (no manual approval needed)
- 30-day free trial starts immediately
- LabAdmin can login right after registration

### 2. **Role-Based Routing**
- **SuperAdmin** → `/super-admin/dashboard` (Lab Management)
- **LabAdmin** → `/dashboard/pathology` (Pathology Operations)
- **Technician/Receptionist** → `/dashboard/pathology`

### 3. **Role-Based Sidebar Navigation**
- **SuperAdmin Sidebar:**
  - 🏢 Lab Management (All Labs, Pending Approvals, Active Labs)
  - 👥 User Management (Create User, Manage Users)
  
- **LabAdmin Sidebar:**
  - 🛠️ Setup (Doctors, Tests, Categories, etc.)
  - 👤 Patients (Register, Search)
  - 🧪 Tests / Lab Reports (Generate, View, Summary)
  - 📅 Appointments / Sample Collection
  - 💳 Billing / Payments
  - 📦 Inventory
  - 📈 Analytics / Reports

### 4. **Default Routes for LabAdmin**
- All LabAdmin users get 26 default routes automatically
- Full access to pathology features
- No manual route assignment needed

---

## 🧪 Test Scenarios:

### **Test 1: SuperAdmin Login**

**Credentials:**
```
Email: superadmin@pathologysaas.com
Password: SuperAdmin@123
```

**Expected Behavior:**
1. ✅ Login successful
2. ✅ Redirects to `/super-admin/dashboard`
3. ✅ Sidebar shows:
   - 🏢 Lab Management
   - 👥 User Management
4. ✅ Dashboard shows:
   - Total Labs
   - Pending Approvals
   - Active Labs
   - Trial/Basic/Premium Labs
   - List of all labs with approve/reject buttons

---

### **Test 2: LabAdmin Login (Existing User)**

**Credentials:**
```
Email: adminvns@gmail.com
Password: admin123
```

**Expected Behavior:**
1. ✅ Login successful
2. ✅ Redirects to `/dashboard/pathology`
3. ✅ Sidebar shows:
   - 🛠️ Setup
   - 👤 Patients
   - 🧪 Tests / Lab Reports
   - 📅 Appointments
   - 💳 Billing
   - 📦 Inventory
   - 📈 Analytics
4. ✅ Dashboard shows:
   - Today's Tests
   - Total Registrations
   - Pending Reports
   - Revenue charts
   - Recent invoices

---

### **Test 3: Fresh Lab Registration**

**Steps:**
1. Go to: `http://localhost:4201/auth/lab-register`
2. Fill in lab details:
   - Lab Name: Test Lab
   - Email: testlab@example.com
   - Password: Test@123
   - Admin Name: Test Admin
   - Phone: 1234567890
   - Address: Test Address
3. Click "Register Lab"

**Expected Behavior:**
1. ✅ Success message: "Your 30-day FREE trial has started!"
2. ✅ Lab code generated: LAB00002
3. ✅ Redirects to login page
4. ✅ Login with same credentials
5. ✅ Redirects to `/dashboard/pathology`
6. ✅ Full pathology dashboard access
7. ✅ Sidebar shows all pathology features

---

### **Test 4: Trial Expiry Check**

**Manual Test (Database):**
```bash
# Set trial to expired
mongosh Lab-E-commerce --eval "db.labs.updateOne({labCode: 'LAB00001'}, {\$set: {trialEndsAt: new Date('2024-01-01')}})"

# Try to login with adminvns@gmail.com
# Expected: "Your trial period has expired. Please subscribe to continue."

# Reset trial
mongosh Lab-E-commerce --eval "db.labs.updateOne({labCode: 'LAB00001'}, {\$set: {trialEndsAt: new Date('2025-12-12')}})"
```

---

### **Test 5: Route Access Control**

**LabAdmin Access:**
- ✅ Can access: `/pathology/test-report`
- ✅ Can access: `/setup/doctors`
- ✅ Can access: `/billing`
- ❌ Cannot access: `/super-admin/dashboard` (403 Forbidden)

**SuperAdmin Access:**
- ✅ Can access: `/super-admin/dashboard`
- ✅ Can access: `/auth/register` (create users)
- ✅ Can access: `/roles/list` (manage users)
- ❌ Should NOT see pathology sidebar items

---

## 🚀 Quick Test Commands:

### **1. Check Current Users:**
```bash
node back-end/scripts/checkCurrentState.js
```

### **2. Reset Lab Admin Password:**
```bash
node back-end/scripts/resetLabPassword.js
```

### **3. Update Lab Admin Routes:**
```bash
node back-end/scripts/updateLabAdminRoutes.js
```

### **4. Clean Database (Remove All Labs):**
```bash
node back-end/scripts/cleanupLabs.js
```

---

## 📝 Summary:

**Before:**
- ❌ Labs needed manual approval
- ❌ LabAdmin couldn't login after registration
- ❌ No role-based sidebar
- ❌ SuperAdmin saw pathology features

**After:**
- ✅ Auto-approve with 30-day trial
- ✅ Immediate login after registration
- ✅ Role-based sidebar (SuperAdmin vs LabAdmin)
- ✅ SuperAdmin sees only lab management
- ✅ LabAdmin sees full pathology features
- ✅ Default routes assigned automatically

---

## 🎯 Next Steps (Future):

1. **Subscription Payment Integration:**
   - Add payment gateway (Razorpay/Stripe)
   - Upgrade from trial to basic/premium
   - Auto-block access after trial expires

2. **Lab Settings:**
   - Allow LabAdmin to customize lab details
   - Upload logo, signature
   - Configure report templates

3. **Multi-User Management:**
   - LabAdmin can create Technicians, Receptionists
   - Role-based permissions within lab
   - User activity tracking

---

**System is now ready for testing! 🎉**

