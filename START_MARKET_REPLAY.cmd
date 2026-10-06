@echo off
setlocal
pushd "%~dp0"
title Market Flow US Replay

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
echo Market Flow US - Market Replay
echo ========================================
echo Keep the authenticated provider page open in your browser.
echo Paste its full address or just its origin below.
echo Replay Host uses only that exact Origin and replay-owned local DB files.
echo The normal live DB is never opened or reset by Replay Host.
echo.

set "MARKET_FLOW_US_PROVIDER_URL="
set /p "MARKET_FLOW_US_PROVIDER_URL=Provider page URL: "
if not defined MARKET_FLOW_US_PROVIDER_URL goto :invalid_url

set "MARKET_FLOW_US_ORIGIN="
for /f "delims=" %%O in ('powershell -NoProfile -Command "$u=$null; if([uri]::TryCreate($env:MARKET_FLOW_US_PROVIDER_URL,[System.UriKind]::Absolute,[ref]$u) -and ($u.Scheme -eq 'http' -or $u.Scheme -eq 'https') -and -not [string]::IsNullOrWhiteSpace($u.Host) -and [string]::IsNullOrEmpty($u.UserInfo)){ $u.GetLeftPart([System.UriPartial]::Authority) }"') do set "MARKET_FLOW_US_ORIGIN=%%O"

if not defined MARKET_FLOW_US_ORIGIN goto :invalid_url

echo.
echo Exact allowed Origin:
echo   %MARKET_FLOW_US_ORIGIN%
echo.

echo [1/2] Building the dedicated Replay browser runtime...
call npm run build:replay
if errorlevel 1 goto :fail

if not exist "dist\replay\market-flow-us-replay.bookmarklet.txt" (
  echo [ERROR] Replay bookmarklet output was not created.
  goto :fail
)

echo.
echo [2/2] Preparing the Replay bookmarklet...
type "dist\replay\market-flow-us-replay.bookmarklet.txt" | clip
start "" notepad.exe "%~dp0dist\replay\market-flow-us-replay.bookmarklet.txt"

echo.
echo The Replay bookmarklet was copied to the clipboard and opened in Notepad.
echo Run it only on the exact provider Origin shown above.
echo The browser pairs once with this Replay Host run; the control credential stays ephemeral.
echo Press Ctrl+C here when you want to stop Replay Host and its owned service child.
echo.
echo Starting Replay Host...
echo.

call npm run replay-host -- --allowed-origin "%MARKET_FLOW_US_ORIGIN%"
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo Market Replay Host stopped.
) else (
  echo [ERROR] Market Replay Host exited with code %RESULT%.
)
echo.
pause
popd
exit /b %RESULT%

:runtime_fail
echo.
echo Install/use Node.js 24.x before running Market Replay.
echo.
pause
popd
exit /b 1

:invalid_url
echo.
echo [ERROR] Enter a normal http:// or https:// provider page URL.
echo Do not enter a URL containing a username or password.
echo.
pause
popd
exit /b 1

:fail
echo.
echo [ERROR] Market Replay could not be prepared.
echo.
pause
popd
exit /b 1
