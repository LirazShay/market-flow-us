@echo off
setlocal
pushd "%~dp0"
title Market Flow US Demo

if not exist "node_modules" (
  echo [ERROR] Market Flow US is not set up yet.
  echo Run SETUP.cmd first.
  echo.
  pause
  popd
  exit /b 1
)

echo ========================================
echo Market Flow US - Local Demo
echo ========================================
echo Starting the normal Market Flow US stack with Fake Market.
echo The browser will open automatically when the demo is ready.
echo Keep this window open. Press Ctrl+C here to stop the demo.
echo.

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "$deadline=(Get-Date).AddSeconds(30); while((Get-Date)-lt $deadline){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173/' -TimeoutSec 1; if($r.StatusCode -eq 200){ Start-Process 'http://127.0.0.1:4173/'; exit 0 } } catch {} ; Start-Sleep -Seconds 1 }; exit 1" >nul 2>&1

call npm run demo:fake-market
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo Market Flow US demo stopped.
) else (
  echo [ERROR] Market Flow US demo exited with code %RESULT%.
  echo If port 4173 or 8765 is already in use, close the older Market Flow US process and try again.
)
echo.
pause
popd
exit /b %RESULT%
