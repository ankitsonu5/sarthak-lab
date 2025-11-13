# Test login and check lab name in response
Write-Host "`n=== Testing Lab Name in Login Response ===" -ForegroundColor Cyan

$users = @(
    @{ email = "adminvns@gmail.com"; password = "admin123"; expectedLab = "Varanasi Lab" },
    @{ email = "sg@gmail.com"; password = "admin123"; expectedLab = "path lab" }
)

foreach ($user in $users) {
    Write-Host "`n--- Testing: $($user.email) ---" -ForegroundColor Yellow
    
    $body = @{
        email = $user.email
        password = $user.password
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
            -Method POST `
            -ContentType "application/json" `
            -Body $body

        Write-Host "✅ Login successful!" -ForegroundColor Green
        Write-Host "   Role: $($response.user.role)" -ForegroundColor White
        Write-Host "   Lab Name (from lab): $($response.user.lab.labName)" -ForegroundColor Cyan
        Write-Host "   Lab Settings Name: $($response.user.labSettings.labName)" -ForegroundColor Cyan
        
        if ($response.user.lab.labName -eq $user.expectedLab) {
            Write-Host "   ✅ Lab name matches expected: $($user.expectedLab)" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Lab name mismatch! Expected: $($user.expectedLab), Got: $($response.user.lab.labName)" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ Login failed: $_" -ForegroundColor Red
    }
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan

