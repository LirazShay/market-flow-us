@echo off
setlocal

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 24.x and try again.
  exit /b 1
)

set "MARKET_FLOW_US_NODE_MAJOR="
for /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0]"') do set "MARKET_FLOW_US_NODE_MAJOR=%%V"
if not "%MARKET_FLOW_US_NODE_MAJOR%"=="24" (
  echo [ERROR] Market Flow US requires Node.js 24.x.
  echo Current version:
  node -v
  exit /b 1
)

exit /b 0
