# Hospital Management System PowerShell Launcher
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Hospital Management System Launcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "🏥 Starting Hospital Management System..." -ForegroundColor Green
Write-Host ""

# Check if node_modules exists
if (!(Test-Path "node_modules")) {
    Write-Host "⚠️  Node modules not found. Installing dependencies..." -ForegroundColor Yellow
    npm install
    Write-Host "✅ Dependencies installed successfully!" -ForegroundColor Green
    Write-Host ""
}

# Check if MongoDB is running
Write-Host "📋 Checking MongoDB connection..." -ForegroundColor Blue
try {
    $mongoCheck = mongosh --eval "db.runCommand('ping')" --quiet 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ MongoDB is running" -ForegroundColor Green
    } else {
        Write-Host "⚠️  MongoDB might not be running. Please start MongoDB service." -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not check MongoDB status. Please ensure MongoDB is installed and running." -ForegroundColor Yellow
}
Write-Host ""

# Start Backend in new PowerShell window
Write-Host "🔄 Starting Backend Server (Port 3000)..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run backend"

# Wait for backend to start
Write-Host "⏳ Waiting for backend to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Start Frontend in new PowerShell window
Write-Host "🌐 Starting Frontend Server (Port 4201)..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run frontend"

Write-Host ""
Write-Host "✅ Hospital Management System is starting..." -ForegroundColor Green
Write-Host ""
Write-Host "📍 Access URLs:" -ForegroundColor Cyan
Write-Host "   🌐 Frontend: http://localhost:4201" -ForegroundColor White
Write-Host "   🔌 Backend:  http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host "🔑 Default Login Credentials:" -ForegroundColor Cyan
Write-Host "   📧 Admin:   admin@hospital.com / admin123" -ForegroundColor White
Write-Host "   👨‍⚕️ Doctor:  doctor1@hospital.com / doctor123" -ForegroundColor White
Write-Host "   🏥 Patient: patient1@hospital.com / patient123" -ForegroundColor White
Write-Host ""
Write-Host "💡 To stop the system, close both PowerShell windows" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# Keep this window open
Read-Host "Press Enter to exit this launcher"
