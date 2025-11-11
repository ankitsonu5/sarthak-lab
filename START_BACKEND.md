# 🚀 Backend Server Setup Instructions

## 📋 Prerequisites
1. **MongoDB** must be installed and running
2. **Node.js** must be installed

## 🔧 Quick Start

### Option 1: Start Backend Only
```bash
npm run backend
```

### Option 2: Start Both Frontend & Backend
```bash
npm start
```

### Option 3: Manual Start
```bash
node server.js
```

## 🔍 Verify Backend is Running

1. **Check Console Output:**
   - Should see: "Server is running on port 3001"
   - Should see: "MongoDB Connected"

2. **Test API Endpoint:**
   ```bash
   curl http://103.181.200.73:3001/api/doctors
   ```

3. **Browser Test:**
   - Open: http://localhost:3001
   - Should see: "Hospital Management System API is running!"

## 🗄️ MongoDB Setup

### Windows:
1. **Install MongoDB Community Server**
2. **Start MongoDB Service:**
   ```bash
   net start MongoDB
   ```

### Alternative - MongoDB Compass:
1. Install MongoDB Compass
2. Connect to: `mongodb://localhost:27017`
3. Create database: `hospital_management`

## 🐛 Troubleshooting

### Backend Not Starting:
1. Check if port 3000 is free
2. Ensure MongoDB is running
3. Check for missing dependencies: `npm install`

### Database Connection Issues:
1. Verify MongoDB is running
2. Check connection string in `.env` file
3. Default: `mongodb://localhost:27017/hospital_management`

### API Not Responding:
1. Check console for errors
2. Verify CORS settings
3. Test with Postman or curl

## 📡 API Endpoints

- **GET** `/api/doctors` - Get all doctors
- **POST** `/api/doctors` - Create new doctor
- **PUT** `/api/doctors/:id` - Update doctor
- **DELETE** `/api/doctors/:id` - Delete doctor

## 🎯 Current Status

✅ **Frontend**: Running on http://localhost:4201
⚠️ **Backend**: Needs to be started manually
⚠️ **Database**: Needs MongoDB running

## 🔄 Auto-Start Script

Use the provided batch file:
```bash
start-hospital-system.bat
```

This will start both frontend and backend automatically.
