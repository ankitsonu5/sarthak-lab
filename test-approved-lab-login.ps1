# Test login for approved lab user
Write-Host "Testing login for approved lab user..." -ForegroundColor Cyan

# Test with the approved lab admin
$email = "adminvns@gmail.com"
$password = "admin123"

Write-Host "`nTrying to login with: $email" -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body (@{
            email = $email
            password = $password
        } | ConvertTo-Json) `
        -UseBasicParsing

    Write-Host "`n✅ Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "`nResponse:" -ForegroundColor Yellow
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "`n❌ Status Code: $statusCode" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "`nError Response:" -ForegroundColor Yellow
        $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 10
    } else {
        Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
    }
}

