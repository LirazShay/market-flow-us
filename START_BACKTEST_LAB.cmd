@echo off
setlocal
pushd "%~dp0"
title Market Flow US Backtest Lab

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
echo Market Flow US - Backtest Lab
echo ========================================
echo Offline historical research only. No provider login or open market is required.
echo The Lab reads only product-owned active/archive Market Flow US DuckDB evidence.
echo Source market databases are opened read-only; the Lab does not start Collector, Replay, or IBKR order service.
echo The browser will open automatically when the Lab is ready.
echo Keep this window open. Press Ctrl+C here to stop the Lab.
echo.

powershell -NoProfile -Command "$c=$null; try { $c=[System.Net.Sockets.TcpClient]::new('127.0.0.1',8767); exit 1 } catch { exit 0 } finally { if($null -ne $c){ $c.Close() } }"
if errorlevel 1 goto :port_fail

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "$deadline=(Get-Date).AddSeconds(30); while((Get-Date)-lt $deadline){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8767/' -TimeoutSec 1; if($r.StatusCode -eq 200 -and $r.Content -match 'Market Flow US.+Backtest Lab'){ Start-Process 'http://127.0.0.1:8767/'; exit 0 } } catch {} ; Start-Sleep -Seconds 1 }; exit 1" >nul 2>&1

call npm run backtest-lab
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo Market Flow US Backtest Lab stopped.
) else (
  echo [ERROR] Market Flow US Backtest Lab exited with code %RESULT%.
)
echo.
pause
popd
exit /b %RESULT%

:runtime_fail
echo.
echo Install/use Node.js 24.x before running Backtest Lab.
echo.
pause
popd
exit /b 1

:port_fail
echo.
echo [ERROR] Port 8767 is already in use.
echo Close the older Backtest Lab or other process using 127.0.0.1:8767 and try again.
echo No browser was opened and no process was stopped automatically.
echo.
pause
popd
exit /b 1
