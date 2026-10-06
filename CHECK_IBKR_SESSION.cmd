@echo off
setlocal
pushd "%~dp0"

call "%~dp0scripts\windows-require-node24.cmd"
if errorlevel 1 (
  popd
  exit /b 1
)

if "%~1"=="" (
  echo [INFO] Checking CPGW session compatibility with normal TLS verification.
  call npm run order-service:session-check
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)

if /I "%~1"=="INSECURE_LOCALHOST_TLS" (
  echo [WARNING] Relaxing TLS verification only for the loopback CPGW client.
  call npm run order-service:session-check -- --allow-insecure-loopback-tls
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)

echo Usage: CHECK_IBKR_SESSION.cmd [INSECURE_LOCALHOST_TLS]
popd
exit /b 2
