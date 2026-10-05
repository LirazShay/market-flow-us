@echo off
setlocal
pushd "%~dp0"
title Market Flow US Tests

call "%~dp0scripts\windows-require-node24.cmd"
if errorlevel 1 goto :runtime_fail

if not exist "node_modules" (
  echo [ERROR] Market Flow US is not set up yet.
  echo Run SETUP.cmd first.
  echo.
  pause
  popd
  exit /b 1
)

echo ========================================
echo Market Flow US - Regular Verification
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

:runtime_fail
echo.
echo Install/use Node.js 24.x before running Market Flow US.
echo.
pause
popd
exit /b 1

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
