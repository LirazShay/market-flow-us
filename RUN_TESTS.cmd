@echo off
setlocal
pushd "%~dp0"
title MarketScope Tests

if not exist "node_modules" (
  echo [ERROR] MarketScope is not set up yet.
  echo Run SETUP.cmd first.
  echo.
  pause
  popd
  exit /b 1
)

echo ========================================
echo MarketScope - Regular Verification
echo ========================================
echo.

echo [1/3] Fast unit + real-service tests...
call npm run test:fast
if errorlevel 1 goto :fail

echo.
echo [2/3] Building the browser runtime...
call npm run build:browser
if errorlevel 1 goto :fail

echo.
echo [3/3] Chromium end-to-end tests...
call npm run test:e2e
if errorlevel 1 goto :fail

echo.
echo ========================================
echo ALL REGULAR TESTS PASSED
echo ========================================
echo Representative workload testing is separate:
echo   npm run test:workload
echo.
pause
popd
exit /b 0

:fail
echo.
echo ========================================
echo TESTS FAILED
echo ========================================
echo Review the first error above.
echo.
pause
popd
exit /b 1
