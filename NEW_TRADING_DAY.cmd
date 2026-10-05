@echo off
setlocal
pushd "%~dp0"
title Market Flow US - New Trading Day

if not exist "node_modules" (
  echo [ERROR] Market Flow US is not set up yet.
  echo Run SETUP.cmd first.
  echo.
  pause
  popd
  exit /b 1
)

echo ========================================
echo Market Flow US - New Trading Day
echo ========================================
echo Stop Market Flow US before continuing.
echo The current active DB will be archived under data\archive\.
echo Saved Scanner queries will be copied into a fresh schema-v3 active DB.
echo.

call npm run db:new-day
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo New trading day database is ready.
) else (
  echo [ERROR] New trading day preparation failed with code %RESULT%.
  echo The previous active database is kept or restored whenever installation cannot complete.
)
echo.
pause
popd
exit /b %RESULT%
