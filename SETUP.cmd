@echo off
setlocal
pushd "%~dp0"
title MarketScope Setup

echo ========================================
echo MarketScope - First Time Setup
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 24.x and run SETUP.cmd again.
  goto :fail
)

for /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if not "%NODE_MAJOR%"=="24" (
  echo [ERROR] MarketScope requires Node.js 24.x.
  echo Current version:
  node -v
  goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found.
  goto :fail
)

echo [1/2] Installing pinned npm dependencies...
call npm ci
if errorlevel 1 goto :fail

echo.
echo [2/2] Installing pinned Playwright Chromium...
call npx playwright install chromium
if errorlevel 1 goto :fail

echo.
echo ========================================
echo SETUP COMPLETE
echo ========================================
echo You can now run START_DEMO.cmd or START_MARKETSCOPE.cmd.
echo.
pause
popd
exit /b 0

:fail
echo.
echo ========================================
echo SETUP FAILED
echo ========================================
echo Fix the error above and run SETUP.cmd again.
echo.
pause
popd
exit /b 1
