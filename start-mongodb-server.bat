@echo off
echo ========================================
echo 🍃 Starting MongoDB Server
echo ========================================

REM Check if MongoDB is already running
tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | find /I /N "mongod.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo ✅ MongoDB is already running on port 27017
    goto :end
)

echo 🔄 Starting MongoDB Server...

REM Create data directory if it doesn't exist
if not exist "C:\data" mkdir "C:\data"
if not exist "C:\data\db" mkdir "C:\data\db"

REM Start MongoDB with custom data path
echo 📁 Data directory: C:\data\db
echo 🌐 Port: 27017

REM Try to start MongoDB
"C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe" --dbpath "C:\data\db" --port 27017

:end
echo.
echo 🎉 MongoDB Server is ready!
echo 🌐 Connection: mongodb://localhost:27017
echo.
pause
