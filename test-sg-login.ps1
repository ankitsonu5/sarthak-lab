# Test sg@gmail.com login

Write-Host "Testing sg@gmail.com login..." -ForegroundColor Yellow

$body = @{
    email = "sg@gmail.com"
    password = "admin123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
        -Method POST `
        -Body $body `
        -ContentType "application/json"
    
    Write-Host "Login Successful!" -ForegroundColor Green
    Write-Host "Email: $($response.user.email)" -ForegroundColor White
    Write-Host "Role: $($response.user.role)" -ForegroundColor White
    Write-Host "Lab: $($response.user.lab.labName)" -ForegroundColor White
} catch {
    Write-Host "Login Failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    # Get detailed error
    $errorDetails = $_.ErrorDetails.Message
    if ($errorDetails) {
        Write-Host "Details: $errorDetails" -ForegroundColor Yellow
    }
}

