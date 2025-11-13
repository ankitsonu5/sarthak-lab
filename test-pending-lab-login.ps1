# Test login for pending lab user
Write-Host "Testing login for pending lab user..." -ForegroundColor Cyan

# Get the newly registered lab's admin email from MongoDB
$labEmail = mongosh Lab-E-commerce --quiet --eval "db.users.find({role: 'LabAdmin'}).sort({createdAt: -1}).limit(1).toArray()[0]?.email" | Out-String
$labEmail = $labEmail.Trim()

Write-Host "Lab Admin Email: $labEmail" -ForegroundColor Yellow

# Try to login
$response = curl -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"$labEmail\",\"password\":\"admin123\"}" `
  2>&1

Write-Host "`nStatus Code: $($response.StatusCode)" -ForegroundColor $(if ($response.StatusCode -eq 200) { "Green" } else { "Red" })
Write-Host "Response:" -ForegroundColor Yellow
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

