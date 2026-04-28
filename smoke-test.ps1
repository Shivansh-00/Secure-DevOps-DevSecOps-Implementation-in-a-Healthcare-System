$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "`n=== 1. Login as doctor ===" -ForegroundColor Cyan
$loginBody = '{"email":"doc@h.io","password":"StrongP@ssw0rd!23"}'
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login `
  -ContentType 'application/json' -Body $loginBody
$token = $login.token
Write-Host "Token: $($token.Substring(0,40))..."

Write-Host "`n=== 2. Get patient owner id from JWT ===" -ForegroundColor Cyan
$patLogin = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login `
  -ContentType 'application/json' -Body '{"email":"pat@h.io","password":"PatientP@ss!23"}'
$payload = $patLogin.token.Split('.')[1]
# pad base64
$pad = 4 - ($payload.Length % 4); if ($pad -lt 4) { $payload += ('=' * $pad) }
$ownerId = ([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload.Replace('-','+').Replace('_','/'))) | ConvertFrom-Json).sub
Write-Host "Owner ID: $ownerId"

Write-Host "`n=== 3. Create patient record (PHI encrypted) ===" -ForegroundColor Cyan
$record = @{
  ownerId   = $ownerId
  fullName  = 'John Doe'
  ssn       = '123-45-6789'
  diagnosis = 'Hypertension'
  notes     = 'Routine checkup'
} | ConvertTo-Json
$created = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/patients `
  -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $record
$created | ConvertTo-Json

Write-Host "`n=== 4. List records (decrypted via Mongoose getter) ===" -ForegroundColor Cyan
$list = Invoke-RestMethod -Uri http://localhost:3000/api/patients -Headers @{ Authorization = "Bearer $token" }
$list | ConvertTo-Json -Depth 4

Write-Host "`n=== 5. Patient cannot access doctor's create endpoint (RBAC) ===" -ForegroundColor Cyan
$patToken = $patLogin.token
try {
  Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/patients `
    -Headers @{ Authorization = "Bearer $patToken" } -ContentType 'application/json' -Body $record
  Write-Host "FAIL: patient was allowed!" -ForegroundColor Red
} catch {
  Write-Host "OK: blocked with HTTP $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Green
}

Write-Host "`n=== 6. Verify ciphertext at rest in MongoDB ===" -ForegroundColor Cyan
docker compose exec -T mongo mongosh --quiet healthcare --eval "JSON.stringify(db.patients.findOne({}, {fullName:1, ssn:1, diagnosis:1, _id:0}), null, 2)"

Write-Host "`nAll smoke tests done." -ForegroundColor Green
