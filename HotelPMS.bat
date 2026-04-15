@echo off
title Hotel PMS
echo.
echo  ==========================================
echo   🏨  Hotel PMS — Starting...
echo  ==========================================
echo.

REM ── Try Python 3 ──────────────────────────────────────────────────────────
where python >nul 2>&1
if %errorlevel% == 0 (
    echo  Starting server with Python...
    python "%~dp0launch_server.py"
    goto :done
)

where python3 >nul 2>&1
if %errorlevel% == 0 (
    echo  Starting server with Python3...
    python3 "%~dp0launch_server.py"
    goto :done
)

REM ── Python not found — fall back to opening the file directly ─────────────
echo  Python not found. Opening file directly in browser.
echo  Note: Some features may not work without a local server.
echo.
start "" "%~dp0index.html"

:done
pause
