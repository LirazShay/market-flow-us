@echo off
setlocal
pushd "%~dp0"
title Market Flow US Demo Reset

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
echo Market Flow US - Reset Demo Data
echo ========================================
echo Stop START_DEMO.cmd first.
echo This deletes only the local .demo state used by Fake Market demo.
echo Production data is not touched.
echo.
pause

call npm run demo:reset
if errorlevel 1 goto :fail

echo.
echo Demo state was reset successfully.
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
echo [ERROR] Demo reset failed.
echo.
pause
popd
exit /b 1
