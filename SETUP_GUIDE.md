# Multi-Lab Pathology SaaS - Setup Guide

## 🚀 Quick Start Guide

This guide will help you set up the Multi-Lab Pathology SaaS platform from scratch.

---

## 📋 Prerequisites

### Required Software
1. **Node.js** (v16 or higher)
2. **PostgreSQL** (v14 or higher)
3. **npm** or **yarn**
4. **Git**

### Optional
- **pgAdmin** (for database management)
- **Postman** (for API testing)

---

## 🗄️ Database Setup

### Step 1: Install PostgreSQL

#### Windows
```bash
# Download from: https://www.postgresql.org/download/windows/
# Or use Chocolatey:
choco install postgresql
```

#### macOS
```bash
brew install postgresql@14
brew services start postgresql@14
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Step 2: Create Database

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE pathology_saas;

# Create user (optional)
CREATE USER pathology_admin WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE pathology_saas TO pathology_admin;

# Exit
\q
```

### Step 3: Run Schema Migration

```bash
# Navigate to project directory
cd back-end

# Run schema file
psql -U postgres -d pathology_saas -f database/postgres-schema.sql
```

**Expected Output:**
```
CREATE EXTENSION
CREATE TABLE
CREATE INDEX
...
INSERT 0 3
```

### Step 4: Verify Database

```bash
# Connect to database
psql -U postgres -d pathology_saas

# List tables
\dt

# Check subscription plans
SELECT * FROM subscription_plans;

# Exit
\q
```

---

## 🔧 Backend Setup

### Step 1: Install Dependencies

```bash
cd back-end
npm install
```

### Step 2: Install Additional Packages

```bash
# Install PostgreSQL driver
npm install pg

# Install bcrypt for password hashing
npm install bcrypt

# Install jsonwebtoken for JWT
npm install jsonwebtoken

# Install dotenv for environment variables
npm install dotenv
```

### Step 3: Configure Environment Variables

Create `.env` file in `back-end/` directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=pathology_saas
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password_here

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# MongoDB (Keep for backward compatibility during migration)
MONGODB_URI=mongodb://localhost:27017/Lab-E-commerce

# Email Configuration (for future use)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Frontend URL
FRONTEND_URL=http://localhost:4201

# File Upload
MAX_FILE_SIZE=5242880
UPLOAD_DIR=./uploads
```

### Step 4: Update Server File

Create `back-end/server-postgres.js`:

```javascript
const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./config/postgres');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize PostgreSQL
initializeDatabase();

// Routes
app.use('/api/auth', require('./routes/auth-postgres'));
app.use('/api/labs', require('./routes/labs'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', database: 'PostgreSQL', timestamp: new Date() });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🗄️ Database: PostgreSQL`);
  console.log(`🌐 API URL: http://localhost:${PORT}`);
});
```

### Step 5: Start Backend Server

```bash
# Development mode
npm run dev

# Or production mode
npm start
```

**Expected Output:**
```
🚀 Server running on port 3000
🗄️ Database: PostgreSQL
✅ Connected to PostgreSQL database
✅ Database tables exist
```

---

## 🎨 Frontend Setup

### Step 1: Install Dependencies

```bash
cd ../src
npm install
```

### Step 2: Update Environment

Update `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  database: 'postgres' // Changed from 'mongodb'
};
```

### Step 3: Start Frontend

```bash
ng serve --port 4201
```

**Expected Output:**
```
✔ Browser application bundle generation complete.
Initial Chunk Files | Names         |  Raw Size
...
Application bundle generation complete.
➜  Local:   http://localhost:4201/
```

---

## 🧪 Testing the Setup

### 1. Test Database Connection

```bash
curl http://localhost:3000/api/health
```

**Expected Response:**
```json
{
  "status": "OK",
  "database": "PostgreSQL",
  "timestamp": "2025-11-12T..."
}
```

### 2. Register a New Lab

```bash
curl -X POST http://localhost:3000/api/labs/register \
  -H "Content-Type: application/json" \
  -d '{
    "labName": "Test Pathology Lab",
    "email": "testlab@example.com",
    "phone": "9876543210",
    "address": "123 Test Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "adminFirstName": "John",
    "adminLastName": "Doe",
    "adminEmail": "admin@testlab.com",
    "password": "Test@123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Lab registered successfully. Awaiting admin approval.",
  "lab": {
    "id": "uuid",
    "labCode": "LAB00001",
    "labName": "Test Pathology Lab",
    ...
  }
}
```

### 3. Create Super Admin (Manual)

```bash
# Connect to database
psql -U postgres -d pathology_saas

# Create super admin with hashed password
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, email_verified)
VALUES (
  'superadmin@pathologysaas.com',
  '$2b$10$YourHashedPasswordHere',
  'Super',
  'Admin',
  'SuperAdmin',
  true,
  true
);
```

**To generate password hash:**
```javascript
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash('SuperAdmin@123', 10);
console.log(hash);
```

### 4. Login as Super Admin

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@pathologysaas.com",
    "password": "SuperAdmin@123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "role": "SuperAdmin",
    ...
  }
}
```

### 5. Approve Lab (Super Admin)

```bash
curl -X PUT http://localhost:3000/api/labs/{lab-id}/approve \
  -H "Authorization: Bearer {super-admin-token}" \
  -H "Content-Type: application/json"
```

---

## 📊 Database Management

### View All Labs
```sql
SELECT id, lab_name, lab_code, email, subscription_plan, approval_status 
FROM labs 
ORDER BY created_at DESC;
```

### View All Users
```sql
SELECT u.email, u.role, l.lab_name 
FROM users u 
LEFT JOIN labs l ON u.lab_id = l.id 
ORDER BY u.created_at DESC;
```

### View Lab Statistics
```sql
SELECT * FROM lab_statistics;
```

### Reset Database (CAUTION!)
```bash
# Drop and recreate database
psql -U postgres -c "DROP DATABASE pathology_saas;"
psql -U postgres -c "CREATE DATABASE pathology_saas;"
psql -U postgres -d pathology_saas -f database/postgres-schema.sql
```

---

## 🔐 Security Checklist

- [ ] Change `JWT_SECRET` in `.env`
- [ ] Use strong PostgreSQL password
- [ ] Enable SSL for PostgreSQL in production
- [ ] Set up firewall rules
- [ ] Enable HTTPS for production
- [ ] Implement rate limiting
- [ ] Set up backup strategy
- [ ] Enable audit logging

---

## 🚀 Deployment

### Production Environment Variables

```env
NODE_ENV=production
PORT=3000

# Use managed PostgreSQL (AWS RDS, Azure Database, etc.)
POSTGRES_HOST=your-db-host.region.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DB=pathology_saas_prod
POSTGRES_USER=prod_user
POSTGRES_PASSWORD=strong_password_here
POSTGRES_SSL=true

JWT_SECRET=very-strong-secret-key-min-32-characters
JWT_EXPIRES_IN=24h

FRONTEND_URL=https://yourdomain.com
```

### Docker Deployment (Optional)

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: pathology_saas
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./back-end
    ports:
      - "3000:3000"
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_DB: pathology_saas
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    depends_on:
      - postgres

volumes:
  postgres_data:
```

---

## 📞 Support

For issues or questions:
- Check logs: `tail -f back-end/logs/app.log`
- Database logs: `tail -f /var/log/postgresql/postgresql-14-main.log`
- GitHub Issues: [Your Repo URL]

---

## ✅ Next Steps

1. ✅ Database setup complete
2. ✅ Backend running
3. ✅ Frontend running
4. ⏳ Create Super Admin
5. ⏳ Register first lab
6. ⏳ Approve lab
7. ⏳ Test lab login
8. ⏳ Customize branding
9. ⏳ Add staff users
10. ⏳ Start using the system!

---

**Congratulations! Your Multi-Lab Pathology SaaS platform is ready!** 🎉

