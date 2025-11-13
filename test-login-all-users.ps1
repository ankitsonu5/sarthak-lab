# Test login for all users

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Testing Login for All Users" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: SuperAdmin
Write-Host "`n1️⃣  Testing SuperAdmin Login..." -ForegroundColor Yellow
$superAdminBody = @{
    email = "superadmin@pathologysaas.com"
    password = "SuperAdmin@123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
        -Method POST `
        -Body $superAdminBody `
        -ContentType "application/json"
    
    Write-Host "✅ SuperAdmin Login Successful!" -ForegroundColor Green
    Write-Host "   Email: $($response.user.email)" -ForegroundColor White
    Write-Host "   Role: $($response.user.role)" -ForegroundColor White
    Write-Host "   Name: $($response.user.firstName) $($response.user.lastName)" -ForegroundColor White
    Write-Host "   Token: $($response.token.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    Write-Host "❌ SuperAdmin Login Failed!" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Lab Admin 1 (Varanasi Lab)
Write-Host "`n2️⃣  Testing Lab Admin 1 Login (Varanasi Lab)..." -ForegroundColor Yellow
$labAdmin1Body = @{
    email = "adminvns@gmail.com"
    password = "admin123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
        -Method POST `
        -Body $labAdmin1Body `
        -ContentType "application/json"
    
    Write-Host "✅ Lab Admin 1 Login Successful!" -ForegroundColor Green
    Write-Host "   Email: $($response.user.email)" -ForegroundColor White
    Write-Host "   Role: $($response.user.role)" -ForegroundColor White
    Write-Host "   Name: $($response.user.firstName) $($response.user.lastName)" -ForegroundColor White
    Write-Host "   Lab: $($response.user.lab.labName) ($($response.user.lab.labCode))" -ForegroundColor White
    Write-Host "   Token: $($response.token.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    Write-Host "❌ Lab Admin 1 Login Failed!" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Lab Admin 2 (path lab)
Write-Host "`n3️⃣  Testing Lab Admin 2 Login (path lab)..." -ForegroundColor Yellow
$labAdmin2Body = @{
    email = "sg@gmail.com"
    password = "admin123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
        -Method POST `
        -Body $labAdmin2Body `
        -ContentType "application/json"
    
    Write-Host "✅ Lab Admin 2 Login Successful!" -ForegroundColor Green
    Write-Host "   Email: $($response.user.email)" -ForegroundColor White
    Write-Host "   Role: $($response.user.role)" -ForegroundColor White
    Write-Host "   Name: $($response.user.firstName) $($response.user.lastName)" -ForegroundColor White
    Write-Host "   Lab: $($response.user.lab.labName) ($($response.user.lab.labCode))" -ForegroundColor White
    Write-Host "   Token: $($response.token.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    Write-Host "❌ Lab Admin 2 Login Failed!" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "All Login Tests Completed!" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

