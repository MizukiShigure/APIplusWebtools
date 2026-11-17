@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup_Workbench.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%API_BATCH_NO_PAUSE%"=="1" pause
exit /b %RESULT%
