@echo off
setlocal
pushd "%~dp0"
title Market Flow US Local Acceptance

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

set "PROFILE=%~1"
if not defined PROFILE set "PROFILE=all"

if /I not "%PROFILE%"=="all" if /I not "%PROFILE%"=="static" if /I not "%PROFILE%"=="moving" if /I not "%PROFILE%"=="membership" if /I not "%PROFILE%"=="provider-recovery" if /I not "%PROFILE%"=="restart" if /I not "%PROFILE%"=="demo-buy-runtime" if /I not "%PROFILE%"=="demo-buy-outcomes" if /I not "%PROFILE%"=="ai-investigation-ui" if /I not "%PROFILE%"=="ai-pack-safety" if /I not "%PROFILE%"=="feature" if /I not "%PROFILE%"=="isolated" if /I not "%PROFILE%"=="target" goto :usage

echo ========================================
echo Market Flow US - Local Acceptance
echo Profile: %PROFILE%
echo ========================================
echo.

if /I "%PROFILE%"=="moving" echo Checkpoint: FR-8A moving values.
if /I "%PROFILE%"=="membership" echo Checkpoint: FR-8B add/remove membership.
if /I "%PROFILE%"=="provider-recovery" echo Checkpoint: FR-8C provider failure/recovery.
if /I "%PROFILE%"=="restart" echo Checkpoint: FR-8D service restart/recovery.
if /I "%PROFILE%"=="demo-buy-runtime" echo Checkpoint: FR-8E composed Demo Buy capture/runtime.
if /I "%PROFILE%"=="demo-buy-outcomes" echo Checkpoint: FR-8F progressive Demo Buy outcomes/targeted refresh.
if /I "%PROFILE%"=="ai-investigation-ui" echo Checkpoint: FR-8G ordered/unordered AI Investigation UI/regeneration.
if /I "%PROFILE%"=="ai-pack-safety" echo Checkpoint: FR-8H real-service AI pack safety/regeneration.
if /I "%PROFILE%"=="feature" (
  echo This runs the bounded post-feature Demo Buy + AI Investigation acceptance only.
  echo.
)
if /I "%PROFILE%"=="isolated" (
  echo This runs the target-machine day-bounded isolated persistence/read/Scanner/Demo Buy/AI profile.
  echo It can be materially heavier than FR-7/FR-8 acceptance.
  echo.
)
if /I "%PROFILE%"=="target" (
  echo This runs the representative target-machine 4096 x 180 end-to-end profile.
  echo It is intentionally NOT part of the default all profile.
  echo.
)

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
if /I "%PROFILE%"=="isolated" echo Detail report: test-results\acceptance\details\isolated-target-day.json
if /I "%PROFILE%"=="target" echo Detail report: test-results\acceptance\details\target-4096x180.json
echo.
pause
popd
exit /b %RESULT%

:runtime_fail
echo.
echo Install/use Node.js 24.x before running Market Flow US.
echo.
pause
popd
exit /b 1

:usage
echo [ERROR] Unknown profile: %PROFILE%
echo Usage:
echo   RUN_LOCAL_ACCEPTANCE.cmd
echo   RUN_LOCAL_ACCEPTANCE.cmd static
echo   RUN_LOCAL_ACCEPTANCE.cmd moving
echo   RUN_LOCAL_ACCEPTANCE.cmd membership
echo   RUN_LOCAL_ACCEPTANCE.cmd provider-recovery
echo   RUN_LOCAL_ACCEPTANCE.cmd restart
echo   RUN_LOCAL_ACCEPTANCE.cmd demo-buy-runtime
echo   RUN_LOCAL_ACCEPTANCE.cmd demo-buy-outcomes
echo   RUN_LOCAL_ACCEPTANCE.cmd ai-investigation-ui
echo   RUN_LOCAL_ACCEPTANCE.cmd ai-pack-safety
echo   RUN_LOCAL_ACCEPTANCE.cmd feature
echo   RUN_LOCAL_ACCEPTANCE.cmd isolated
echo   RUN_LOCAL_ACCEPTANCE.cmd target
echo   RUN_LOCAL_ACCEPTANCE.cmd all
echo.
echo Default all runs FR-7 plus FR-8A-H and reports each sub-checkpoint separately.
echo Feature runs only FR-8E-H. Heavy FR-9 profiles must be selected explicitly.
echo.
pause
popd
exit /b 2
