@echo off
setlocal
pushd "%~dp0"
title Market Flow US

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
echo Market Flow US - Real Provider
echo ========================================
echo Keep the authenticated provider page open in your browser.
echo Paste its full address or just its origin below.
echo No cookies, tokens, account identifiers or browser data are copied.
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

echo [1/2] Building the current browser runtime...
call npm run build:browser
if errorlevel 1 goto :fail

if not exist "dist\browser\market-flow-us.bookmarklet.txt" (
  echo [ERROR] Bookmarklet output was not created.
  goto :fail
)

echo.
echo [2/2] Preparing the bookmarklet...
type "dist\browser\market-flow-us.bookmarklet.txt" | clip
start "" notepad.exe "%~dp0dist\browser\market-flow-us.bookmarklet.txt"

echo.
echo The current bookmarklet was copied to the clipboard and opened in Notepad.
echo Keep this window open while using Market Flow US.
echo On the authenticated provider page, run the bookmarklet from a browser bookmark.
echo Press Ctrl+C here when you want to stop the local Market Flow US service.
echo.
echo Starting local service...
echo.

call npm run service -- --allowed-origin "%MARKET_FLOW_US_ORIGIN%"
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo Market Flow US service stopped.
) else (
  echo [ERROR] Market Flow US service exited with code %RESULT%.
)
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
echo [ERROR] Market Flow US could not be prepared.
echo.
pause
popd
exit /b 1
