# Multi-Lab Pathology SaaS - API Reference

## Base URL
```
http://localhost:3000/api
```

---

## 🔐 Authentication

All authenticated endpoints require JWT token in header:
```
Authorization: Bearer <token>
```

---

## 📋 API Endpoints

### 1. Authentication

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "fullName": "John Doe",
    "role": "LabAdmin",
    "permissions": [],
    "lab": {
      "id": "uuid",
      "name": "Test Lab",
      "code": "LAB00001",
      "subscription_plan": "trial"
    }
  }
}
```

**Error Responses:**
- `401` - Invalid credentials
- `403` - Account deactivated / Lab not approved / Subscription expired

---

#### Register User (Lab Admin only)
```http
POST /auth/register
Authorization: Bearer <lab-admin-token>
Content-Type: application/json

{
  "email": "staff@example.com",
  "password": "password123",
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "9876543210",
  "role": "Technician",
  "permissions": ["create_reports", "view_patients"]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "user": {
    "id": "uuid",
    "email": "staff@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "fullName": "Jane Smith",
    "role": "Technician",
    "permissions": ["create_reports", "view_patients"]
  }
}
```

---

#### Get Current User
```http
GET /auth/me
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "fullName": "John Doe",
    "phone": "9876543210",
    "role": "LabAdmin",
    "permissions": [],
    "isActive": true,
    "emailVerified": false,
    "lastLogin": "2025-11-12T10:30:00Z",
    "createdAt": "2025-11-01T08:00:00Z",
    "lab": {
      "id": "uuid",
      "name": "Test Lab",
      "code": "LAB00001",
      "subscriptionPlan": "trial",
      "subscriptionStatus": "active"
    }
  }
}
```

---

### 2. Lab Management

#### Register New Lab (Public)
```http
POST /labs/register
Content-Type: application/json

{
  "labName": "ABC Diagnostics",
  "email": "contact@abcdiagnostics.com",
  "phone": "9876543210",
  "address": "123 Main Street",
  "city": "Mumbai",
  "state": "Maharashtra",
  "country": "India",
  "pincode": "400001",
  "adminFirstName": "Rajesh",
  "adminLastName": "Kumar",
  "adminEmail": "admin@abcdiagnostics.com",
  "adminPhone": "9876543211",
  "password": "SecurePass@123"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Lab registered successfully. Awaiting admin approval.",
  "lab": {
    "id": "uuid",
    "labCode": "LAB00001",
    "labName": "ABC Diagnostics",
    "email": "contact@abcdiagnostics.com",
    "subscriptionPlan": "trial",
    "trialEndsAt": "2025-11-26T10:00:00Z"
  },
  "admin": {
    "id": "uuid",
    "email": "admin@abcdiagnostics.com",
    "name": "Rajesh Kumar",
    "role": "LabAdmin"
  }
}
```

**Error Responses:**
- `400` - Missing required fields
- `409` - Email already exists

---

#### Get All Labs (Super Admin only)
```http
GET /labs?status=pending&plan=trial&page=1&limit=50
Authorization: Bearer <super-admin-token>
```

**Query Parameters:**
- `status` - Filter by approval status (pending, approved, rejected)
- `plan` - Filter by subscription plan (trial, basic, premium)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)

**Response (200 OK):**
```json
{
  "success": true,
  "labs": [
    {
      "id": "uuid",
      "lab_name": "ABC Diagnostics",
      "lab_code": "LAB00001",
      "email": "contact@abcdiagnostics.com",
      "phone": "9876543210",
      "city": "Mumbai",
      "state": "Maharashtra",
      "subscription_plan": "trial",
      "subscription_status": "pending",
      "approval_status": "pending",
      "total_patients": 0,
      "total_reports": 0,
      "total_users": 1,
      "trial_ends_at": "2025-11-26T10:00:00Z",
      "created_at": "2025-11-12T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "pages": 1
  }
}
```

---

#### Get My Lab Details
```http
GET /labs/my-lab
Authorization: Bearer <lab-user-token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "lab": {
    "id": "uuid",
    "lab_name": "ABC Diagnostics",
    "lab_code": "LAB00001",
    "email": "contact@abcdiagnostics.com",
    "phone": "9876543210",
    "address": "123 Main Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "pincode": "400001",
    "logo_url": null,
    "side_logo_url": null,
    "primary_color": "#007bff",
    "secondary_color": "#6c757d",
    "header_note": null,
    "footer_note": null,
    "subscription_plan": "trial",
    "subscription_status": "active",
    "trial_ends_at": "2025-11-26T10:00:00Z",
    "subscription_ends_at": null,
    "total_patients": 0,
    "total_reports": 0,
    "total_users": 1,
    "created_at": "2025-11-12T10:00:00Z"
  }
}
```

---

#### Approve Lab (Super Admin only)
```http
PUT /labs/{lab-id}/approve
Authorization: Bearer <super-admin-token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Lab approved successfully",
  "lab": {
    "id": "uuid",
    "lab_name": "ABC Diagnostics",
    "lab_code": "LAB00001",
    "email": "contact@abcdiagnostics.com"
  }
}
```

**Error Responses:**
- `403` - Not Super Admin
- `404` - Lab not found or already processed

---

## 🔒 Role-Based Access

### Roles & Permissions

| Role | Description | Access Level |
|------|-------------|--------------|
| **SuperAdmin** | Platform administrator | All labs, global settings |
| **LabAdmin** | Lab owner/manager | Own lab, all features |
| **Technician** | Lab technician | Create/edit reports |
| **Doctor** | Referring doctor | View reports, add remarks |
| **Receptionist** | Front desk | Register patients, create invoices |

### Permission Examples

```json
{
  "permissions": [
    "manage_patients",
    "create_reports",
    "view_reports",
    "edit_reports",
    "delete_reports",
    "manage_users",
    "view_analytics",
    "manage_billing"
  ]
}
```

---

## 🚨 Error Responses

### Standard Error Format
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (development only)"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not logged in) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 409 | Conflict (duplicate entry) |
| 500 | Internal Server Error |

---

## 🧪 Testing with cURL

### 1. Register a Lab
```bash
curl -X POST http://localhost:3000/api/labs/register \
  -H "Content-Type: application/json" \
  -d '{
    "labName": "Test Lab",
    "email": "test@lab.com",
    "phone": "9876543210",
    "address": "123 Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "adminFirstName": "Admin",
    "adminLastName": "User",
    "adminEmail": "admin@lab.com",
    "password": "Test@123"
  }'
```

### 2. Login as Super Admin
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@pathologysaas.com",
    "password": "SuperAdmin@123"
  }'
```

### 3. Get All Labs (with token)
```bash
curl -X GET "http://localhost:3000/api/labs?status=pending" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. Approve Lab
```bash
curl -X PUT http://localhost:3000/api/labs/LAB_ID_HERE/approve \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

### 5. Login as Lab Admin
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@lab.com",
    "password": "Test@123"
  }'
```

---

## 📊 Subscription Plans

### Trial Plan
```json
{
  "plan_name": "trial",
  "display_name": "Trial Plan",
  "price_monthly": 0,
  "price_yearly": 0,
  "features": {
    "max_users": 2,
    "max_patients": 50,
    "max_reports_per_month": 100,
    "trial_days": 14
  }
}
```

### Basic Plan
```json
{
  "plan_name": "basic",
  "display_name": "Basic Plan",
  "price_monthly": 2999,
  "price_yearly": 29990,
  "features": {
    "max_users": 5,
    "max_patients": 5000,
    "max_reports_per_month": 1000
  }
}
```

### Premium Plan
```json
{
  "plan_name": "premium",
  "display_name": "Premium Plan",
  "price_monthly": 5999,
  "price_yearly": 59990,
  "features": {
    "max_users": -1,
    "max_patients": -1,
    "max_reports_per_month": -1
  }
}
```

**Note**: `-1` means unlimited

---

## 🔗 Postman Collection

Import this collection for easy testing:

```json
{
  "info": {
    "name": "Pathology SaaS API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Auth",
      "item": [
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/login",
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"admin@lab.com\",\n  \"password\": \"Test@123\"\n}"
            }
          }
        }
      ]
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000/api"
    }
  ]
}
```

---

**For complete API documentation, see the implementation files in `back-end/routes/`**

