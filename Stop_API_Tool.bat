@echo off
setlocal EnableExtensions
if not defined PORT set "PORT=4198"
set "FOUND="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  set "FOUND=1"
  echo Stopping local server PID %%P...
  taskkill /PID %%P /F >nul 2>nul
)

if not defined FOUND echo No local server is listening on port %PORT%.
pause
