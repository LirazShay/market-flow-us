@echo off
setlocal
pushd "%~dp0"

call "%~dp0scripts\windows-require-node24.cmd"
if errorlevel 1 (
  popd
  exit /b 1
)

if "%~1"=="" (
  echo [INFO] Starting standalone IBKR order service in DRY_RUN mode.
  echo [INFO] DRY_RUN cannot submit provider orders.
  call npm run order-service
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)

if /I "%~1"=="LIVE" (
  echo [WARNING] Explicit LIVE process gate requested.
  echo [WARNING] A request still needs executionMode=LIVE and every provider/local safety gate must pass.
  call npm run order-service -- --live
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)

echo Usage: START_IBKR_ORDER_SERVICE.cmd [LIVE]
echo Omit LIVE for the default DRY_RUN mode.
popd
exit /b 2
