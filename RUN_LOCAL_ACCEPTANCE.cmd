@echo off
setlocal
pushd "%~dp0"
title Market Flow US Local Acceptance

if not exist "node_modules" (
  echo [ERROR] Market Flow US is not set up yet.
  echo Run SETUP.cmd first.
  echo.
  pause
  popd
  exit /b 1
)

set "PROFILE=%~1"
if not defined PROFILE set "PROFILE=all"

if /I not "%PROFILE%"=="all" if /I not "%PROFILE%"=="static" if /I not "%PROFILE%"=="recovery" goto :usage

echo ========================================
echo Market Flow US - Local Acceptance
echo Profile: %PROFILE%
echo ========================================
echo.

call node scripts\run-local-acceptance.mjs %PROFILE%
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo ========================================
  echo LOCAL ACCEPTANCE PASSED
  echo ========================================
) else (
  echo ========================================
  echo LOCAL ACCEPTANCE FAILED
  echo ========================================
)
echo Report:
echo   test-results\acceptance\%PROFILE%.json
echo.
pause
popd
exit /b %RESULT%

:usage
echo [ERROR] Unknown profile: %PROFILE%
echo Usage:
echo   RUN_LOCAL_ACCEPTANCE.cmd
 echo   RUN_LOCAL_ACCEPTANCE.cmd static
 echo   RUN_LOCAL_ACCEPTANCE.cmd recovery
 echo   RUN_LOCAL_ACCEPTANCE.cmd all
 echo.
pause
popd
exit /b 2
