@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM Login as doctor and capture token
for /f "tokens=*" %%T in ('curl -sS -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" --data-binary "@.test/login.json" ^| node -e "let d='';process.stdin.on('data',c=^>d+=c).on('end',()=^>console.log(JSON.parse(d).token))"') do set TOKEN=%%T

REM Get patient user id
for /f "tokens=*" %%I in ('curl -sS -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"pat@h.io\",\"password\":\"PatientP@ss!23\"}" ^| node -e "let d='';process.stdin.on('data',c=^>d+=c).on('end',()=^>{const j=JSON.parse(d);const p=j.token.split('.')[1];console.log(JSON.parse(Buffer.from(p,'base64')).sub);})"') do set OWNER=%%I

echo Doctor token: %TOKEN:~0,40%...
echo Patient owner id: %OWNER%

> .test\record.json echo {"ownerId":"%OWNER%","fullName":"John Doe","ssn":"123-45-6789","diagnosis":"Hypertension","notes":"Routine checkup"}

echo.
echo === Create patient record (encrypted PHI) ===
curl -sS -X POST http://localhost:3000/api/patients -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" --data-binary "@.test/record.json"
echo.
echo.
echo === List patient records (decrypted via getter) ===
curl -sS http://localhost:3000/api/patients -H "Authorization: Bearer %TOKEN%"
echo.
echo.
echo === Verify ciphertext in MongoDB (PHI must NOT be plaintext) ===
docker compose exec -T mongo mongosh --quiet healthcare --eval "db.patients.findOne({}, {fullName:1, ssn:1, diagnosis:1, _id:0})"
