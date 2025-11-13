# Test Lab Setup Access Control
Write-Host "`n=== Testing Lab Setup Access Control ===" -ForegroundColor Cyan

$users = @(
    @{ email = "adminvns@gmail.com"; password = "admin123"; role = "LabAdmin"; shouldAccess = $true },
    @{ email = "sg@gmail.com"; password = "admin123"; role = "LabAdmin"; shouldAccess = $true },
    @{ email = "superadmin@pathologysaas.com"; password = "SuperAdmin@123"; role = "SuperAdmin"; shouldAccess = $false }
)

foreach ($user in $users) {
    Write-Host "`n--- Testing: $($user.email) ($($user.role)) ---" -ForegroundColor Yellow
    
    # Login first
    $loginBody = @{
        email = $user.email
        password = $user.password
    } | ConvertTo-Json

    try {
        $loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
            -Method POST `
            -ContentType "application/json" `
            -Body $loginBody

        $token = $loginResponse.token
        Write-Host "✅ Login successful" -ForegroundColor Green

        # Try to access lab settings
        try {
            $headers = @{
                "Authorization" = "Bearer $token"
            }
            
            $labResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/settings/me/lab" `
                -Method GET `
                -Headers $headers

            Write-Host "✅ Can GET lab settings" -ForegroundColor Green

            # Try to update lab settings
            $updateBody = @{
                lab = @{
                    labName = "Test Lab"
                    shortName = "TL"
                }
            } | ConvertTo-Json

            try {
                $updateResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/settings/me/lab" `
                    -Method POST `
                    -Headers $headers `
                    -ContentType "application/json" `
                    -Body $updateBody

                if ($user.shouldAccess) {
                    Write-Host "✅ CORRECT: $($user.role) CAN update lab settings" -ForegroundColor Green
                } else {
                    Write-Host "❌ ERROR: $($user.role) SHOULD NOT be able to update lab settings!" -ForegroundColor Red
                }
            }
            catch {
                $errorMsg = $_.Exception.Message
                if ($user.shouldAccess) {
                    Write-Host "❌ ERROR: $($user.role) SHOULD be able to update lab settings!" -ForegroundColor Red
                    Write-Host "   Error: $errorMsg" -ForegroundColor Red
                } else {
                    Write-Host "✅ CORRECT: $($user.role) CANNOT update lab settings (403 Forbidden)" -ForegroundColor Green
                }
            }
        }
        catch {
            Write-Host "❌ Cannot access lab settings: $_" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ Login failed: $_" -ForegroundColor Red
    }
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan

