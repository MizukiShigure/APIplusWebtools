@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not exist ".git" (
  echo Git clone is required to sync this ZIP snapshot.
  echo git clone https://github.com/MizukiShigure/APIplusWebtools.git
  if not "%API_BATCH_NO_PAUSE%"=="1" pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup_Workbench.ps1" -Action sync
set "RESULT=%ERRORLEVEL%"
if not "%API_BATCH_NO_PAUSE%"=="1" pause
exit /b %RESULT%
