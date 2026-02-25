@echo off
REM Wrapper script that auto-restarts the server on exit.
REM Used with the admin "Restart Server" button which calls process.exit(0).
REM
REM Usage: scripts\run-server.bat
REM   - Runs `node dist/index.js` from packages/server/
REM   - On exit code 0 (admin restart): restarts immediately with new synced files
REM   - On Ctrl+C: stops completely
REM   - On other exit codes: waits 3s and restarts (crash recovery)

set SCRIPT_DIR=%~dp0
set SERVER_DIR=%SCRIPT_DIR%..\packages\server

:loop
echo [run-server] starting server...
cd /d "%SERVER_DIR%"
node dist/index.js
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% equ 0 (
  echo [run-server] clean exit — restarting with latest files...
  goto loop
)

echo [run-server] crashed (exit %EXIT_CODE%) — restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop
