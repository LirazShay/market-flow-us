@echo off
setlocal
pushd "%~dp0"
title MarketScope Demo Reset

if not exist "node_modules" (
  echo [ERROR] MarketScope is not set up yet.
  echo Run SETUP.cmd first.
  echo.
  pause
  popd
  exit /b 1
)

echo ========================================
echo MarketScope - Reset Demo Data
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

:fail
echo.
echo [ERROR] Demo reset failed.
echo.
pause
popd
exit /b 1
