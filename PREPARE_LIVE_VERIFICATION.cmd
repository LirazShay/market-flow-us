@echo off
setlocal
pushd "%~dp0"
title MarketScope Live Verification

if not exist "node_modules" (
  echo [ERROR] MarketScope is not set up yet.
  echo Run SETUP.cmd first.
  echo.
  pause
  popd
  exit /b 1
)

echo ========================================
echo MarketScope - Real Provider Verification
echo ========================================
echo This is the bounded release verification gate.
echo Use a clean current checkout and keep the authenticated provider page open.
echo Stop any other MarketScope producer/service first.
echo.

set "MARKETSCOPE_PROVIDER_URL="
set /p "MARKETSCOPE_PROVIDER_URL=Provider page URL: "
if not defined MARKETSCOPE_PROVIDER_URL goto :invalid_url

set "MARKETSCOPE_ORIGIN="
for /f "delims=" %%O in ('powershell -NoProfile -Command "$u=$null; if([uri]::TryCreate($env:MARKETSCOPE_PROVIDER_URL,[System.UriKind]::Absolute,[ref]$u) -and ($u.Scheme -eq 'http' -or $u.Scheme -eq 'https') -and -not [string]::IsNullOrWhiteSpace($u.Host) -and [string]::IsNullOrEmpty($u.UserInfo)){ $u.GetLeftPart([System.UriPartial]::Authority) }"') do set "MARKETSCOPE_ORIGIN=%%O"

if not defined MARKETSCOPE_ORIGIN goto :invalid_url

echo.
echo Exact allowed Origin:
echo   %MARKETSCOPE_ORIGIN%
echo.

echo [1/2] Building the SHA-bound live verification gate...
call npm run build:live-verification
if errorlevel 1 goto :fail

if not exist "dist\live-verification\market-scope-live-verification.bookmarklet.txt" (
  echo [ERROR] Live-verification bookmarklet output was not created.
  goto :fail
)

echo.
echo [2/2] Preparing the bounded gate...
type "dist\live-verification\market-scope-live-verification.bookmarklet.txt" | clip
start "" notepad.exe "%~dp0dist\live-verification\market-scope-live-verification.bookmarklet.txt"

echo.
echo The live-verification bookmarklet was copied to the clipboard and opened in Notepad.
echo Keep this window open.
echo Run that bookmarklet on the already-authenticated provider page.
echo Only the gate itself may report overall: PASS.
echo Press Ctrl+C here after the gate completes.
echo.
echo Starting the dedicated loopback service with data\live-verification.duckdb...
echo.

call npm run service -- --db data/live-verification.duckdb --allowed-origin "%MARKETSCOPE_ORIGIN%"
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo Verification service stopped.
) else (
  echo [ERROR] Verification service exited with code %RESULT%.
)
echo.
pause
popd
exit /b %RESULT%

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
echo [ERROR] Live verification could not be prepared.
echo The build intentionally refuses a dirty working tree.
echo See docs\LIVE_VERIFICATION.md for the exact gate contract.
echo.
pause
popd
exit /b 1
