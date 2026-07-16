@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem build-portable.ps1 whitelists launcher-port-query.ps1 and launcher-pm2-owner.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-portable.ps1" %*

if errorlevel 1 (
  echo Package failed.
  pause
  exit /b 1
)

pause
