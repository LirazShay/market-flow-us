@echo off
setlocal
pushd "%~dp0"

call scripts\windows-require-node24.cmd
if errorlevel 1 (
  popd
  exit /b 1
)

echo [INFO] Running deterministic synthetic-only IBKR order-service acceptance.
echo [INFO] This command never requires or claims a real-money order.
npm run test:acceptance:order
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
