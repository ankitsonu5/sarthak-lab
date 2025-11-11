@echo off
echo ========================================
echo   Hospital Management System Launcher
echo ========================================
echo.

echo 🏥 Starting Hospital Management System...
echo.

echo 📋 Checking dependencies...
if not exist "node_modules" (
    echo ⚠️  Node modules not found. Installing dependencies...
    npm install
    echo ✅ Dependencies installed successfully!
    echo.
)

echo 🔄 Starting Backend Server (Port 3001)...
start "Backend Server" cmd /k "npm run backend"

echo ⏳ Waiting for backend to initialize...
timeout /t 3 /nobreak >nul

echo 🌐 Starting Frontend Server (Port 4201)...
start "Frontend Server" cmd /k "npm run frontend"

echo.
echo ✅ Hospital Management System is starting...
echo.
echo 📍 Access URLs:
echo    🌐 Frontend: http://localhost:4201
echo    🔌 Backend:  http://localhost:3001
echo.
echo 🔑 Default Login Credentials:
echo    📧 Admin:   admin@hospital.com / admin123
echo    👨‍⚕️ Doctor:  doctor1@hospital.com / doctor123
echo    🏥 Patient: patient1@hospital.com / patient123
echo.
echo 💡 To stop the system, close both terminal windows
echo ========================================

pause
