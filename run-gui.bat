@echo off
REM Simply Beeutiful Events - Event Manager launcher (with save support).
cd /d "%~dp0"

echo Starting SBE Event Manager at http://localhost:8000 ...
echo If the browser shows old content, press Ctrl+F5 for hard refresh.
echo Press Ctrl+C to stop the server.
timeout /t 2 >nul
start "" "http://localhost:8000/?v=20260927b"

where python >nul 2>nul
if %errorlevel%==0 (
    python tools\serve_gui.py --port 8000
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        py tools\serve_gui.py --port 8000
    ) else (
        echo Python not found, trying read-only npx serve... (Save will download instead)
        cd doc-reader
        npx serve .
    )
)
pause
