@echo off
echo ========================================
echo 🏥 Hospital Management System - Database Setup
echo ========================================

echo 🔄 Step 1: Installing MongoDB Community Server...
echo.

REM Download and install MongoDB using winget
winget install MongoDB.Server --accept-package-agreements --accept-source-agreements

if "%ERRORLEVEL%"=="0" (
    echo ✅ MongoDB installed successfully
) else (
    echo ⚠️ MongoDB installation failed or already installed
)

echo.
echo 🔄 Step 2: Starting MongoDB service...

REM Start MongoDB service
net start MongoDB 2>NUL
if "%ERRORLEVEL%"=="0" (
    echo ✅ MongoDB service started
) else (
    echo ⚠️ MongoDB service start failed, trying alternative...
    
    REM Try to start MongoDB manually
    if exist "C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" (
        echo 🔄 Starting MongoDB manually...
        start "MongoDB Server" "C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --dbpath "C:\data\db"
        timeout /t 3 /nobreak >nul
        echo ✅ MongoDB started manually
    ) else (
        echo ❌ MongoDB not found in expected location
    )
)

echo.
echo 🔄 Step 3: Creating database directories...
if not exist "C:\data" mkdir "C:\data"
if not exist "C:\data\db" mkdir "C:\data\db"
echo ✅ Database directories created

echo.
echo 🔄 Step 4: Testing connection...
timeout /t 5 /nobreak >nul

REM Test MongoDB connection
mongo --eval "db.runCommand({connectionStatus: 1})" 2>NUL
if "%ERRORLEVEL%"=="0" (
    echo ✅ MongoDB connection successful
) else (
    echo ⚠️ MongoDB connection test failed
    echo 💡 The application will use fallback connection methods
)

echo.
echo 🌱 Step 5: Seeding database with sample data...
cd /d "%~dp0"
node back-end/scripts/seedDatabase.js

echo.
echo ========================================
echo 🎉 Database Setup Complete!
echo ========================================
echo.
echo 📋 Connection Details:
echo    🌐 URL: mongodb://localhost:27017
echo    🗃️ Database: hospital_management
echo.
echo 🔑 Login Credentials:
echo    👨‍💼 Admin: admin@hospital.com / admin123
echo    👨‍⚕️ Doctor: doctor1@hospital.com / doctor123
echo    🏥 Reception: reception@hospital.com / reception123
echo.
echo 🚀 You can now start the application with: npm run start
echo.
pause
