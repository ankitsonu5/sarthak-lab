@echo off
echo ========================================
echo 🍃 Starting MongoDB Local Server
echo ========================================

REM Create data directory if it doesn't exist
if not exist "mongodb-data" mkdir mongodb-data
if not exist "mongodb-logs" mkdir mongodb-logs

echo 📁 Data directory: %CD%\mongodb-data
echo 📄 Logs directory: %CD%\mongodb-logs

REM Check if MongoDB is already running
tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | find /I /N "mongod.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo ✅ MongoDB is already running
    goto :end
)

REM Try to start MongoDB with different methods
echo 🔄 Attempting to start MongoDB...

REM Method 1: Try system MongoDB
mongod --dbpath "%CD%\mongodb-data" --logpath "%CD%\mongodb-logs\mongodb.log" --port 27017 2>NUL
if "%ERRORLEVEL%"=="0" (
    echo ✅ MongoDB started successfully on port 27017
    goto :end
)

REM Method 2: Try MongoDB from Program Files
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --dbpath "%CD%\mongodb-data" --logpath "%CD%\mongodb-logs\mongodb.log" --port 27017 2>NUL
if "%ERRORLEVEL%"=="0" (
    echo ✅ MongoDB started successfully on port 27017
    goto :end
)

REM Method 3: Try MongoDB from Program Files (x86)
"C:\Program Files (x86)\MongoDB\Server\7.0\bin\mongod.exe" --dbpath "%CD%\mongodb-data" --logpath "%CD%\mongodb-logs\mongodb.log" --port 27017 2>NUL
if "%ERRORLEVEL%"=="0" (
    echo ✅ MongoDB started successfully on port 27017
    goto :end
)

echo ❌ MongoDB not found or failed to start
echo 💡 Please install MongoDB Community Server from:
echo    https://www.mongodb.com/try/download/community
echo.
echo 🔄 Alternative: Using cloud database connection...
echo    The application will try to connect to MongoDB Atlas

:end
echo.
echo 🌐 MongoDB should be accessible at: mongodb://localhost:27017
echo 📊 Database name: hospital_management
echo.
pause
