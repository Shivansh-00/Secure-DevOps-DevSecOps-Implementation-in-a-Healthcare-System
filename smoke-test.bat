@echo off
setlocal EnableDelayedExpansion
echo.
echo === 1. Health check ===
curl -sS http://localhost:3000/health
echo.
echo.
echo === 2. Register doctor ===
curl -sS -X POST http://localhost:3000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"doc@h.io\",\"password\":\"StrongP@ssw0rd!23\",\"name\":\"Dr A\",\"role\":\"doctor\"}"
echo.
echo.
echo === 3. Register patient ===
curl -sS -X POST http://localhost:3000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"pat@h.io\",\"password\":\"PatientP@ss!23\",\"name\":\"Pat\",\"role\":\"patient\"}" > patient.json
type patient.json
echo.
echo.
echo === 4. Login as doctor ===
curl -sS -X POST http://localhost:3000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"doc@h.io\",\"password\":\"StrongP@ssw0rd!23\"}" > token.json
type token.json
echo.
echo.
echo === 5. Unauthorized access blocked ===
curl -sS -o nul -w "HTTP %%{http_code}\n" http://localhost:3000/api/patients
echo.
echo === 6. Metrics endpoint (first 10 lines) ===
curl -sS http://localhost:3000/metrics | findstr /R "^#" | more +0
echo.
echo Done.
