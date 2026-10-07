@echo off
setlocal
pushd "%~dp0"
title Market Flow US - BUY

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
echo Market Flow US - Basic BUY
echo ========================================
echo This dedicated launcher enables BUY only for the current Detail security.
echo Default execution mode is DRY_RUN.
echo Pass LIVE as the first argument only when you deliberately want to arm LIVE mode.
echo.

set "MARKET_FLOW_US_BUY_MODE=DRY_RUN"
set "MARKET_FLOW_US_BUY_LIVE_ARG="
if /I "%~1"=="LIVE" (
  set "MARKET_FLOW_US_BUY_MODE=LIVE"
  set "MARKET_FLOW_US_BUY_LIVE_ARG=--buy-live"
) else if not "%~1"=="" (
  goto :invalid_mode
)

echo Execution mode: %MARKET_FLOW_US_BUY_MODE%
echo.

set "MARKET_FLOW_US_BUY_QUANTITY_RAW="
set /p "MARKET_FLOW_US_BUY_QUANTITY_RAW=BUY quantity for this run: "
if not defined MARKET_FLOW_US_BUY_QUANTITY_RAW goto :invalid_quantity

set "MARKET_FLOW_US_BUY_QUANTITY="
for /f "delims=" %%Q in ('powershell -NoProfile -Command "$v=0.0; if([double]::TryParse($env:MARKET_FLOW_US_BUY_QUANTITY_RAW,[Globalization.NumberStyles]::Float,[Globalization.CultureInfo]::InvariantCulture,[ref]$v) -and -not [double]::IsNaN($v) -and -not [double]::IsInfinity($v) -and $v -gt 0){ $v.ToString('R',[Globalization.CultureInfo]::InvariantCulture) }"') do set "MARKET_FLOW_US_BUY_QUANTITY=%%Q"
if not defined MARKET_FLOW_US_BUY_QUANTITY goto :invalid_quantity

echo.
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
echo BUY quantity: %MARKET_FLOW_US_BUY_QUANTITY%
echo BUY mode: %MARKET_FLOW_US_BUY_MODE%
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
echo Starting BUY-enabled local service...
echo.

call npm run service -- --allowed-origin "%MARKET_FLOW_US_ORIGIN%" --buy-quantity "%MARKET_FLOW_US_BUY_QUANTITY%" %MARKET_FLOW_US_BUY_LIVE_ARG%
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

:invalid_mode
echo.
echo [ERROR] The only supported optional mode argument is LIVE.
echo Omit it for the safer DRY_RUN default.
echo.
pause
popd
exit /b 1

:invalid_quantity
echo.
echo [ERROR] BUY quantity must be a positive finite number using invariant decimal notation.
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
echo [ERROR] Market Flow US BUY mode could not be prepared.
echo.
pause
popd
exit /b 1
