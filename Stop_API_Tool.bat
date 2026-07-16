@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not defined PORT set "PORT=4198"
set "NODE_EXE="
set "PM2_CMD="
set "PM2_JS="

where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"
if not defined NODE_EXE if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"

if exist "%~dp0node_modules\.bin\pm2.cmd" set "PM2_CMD=%~dp0node_modules\.bin\pm2.cmd"
if not defined PM2_CMD if exist "%~dp0node_modules\.bin\pm2" set "PM2_JS=%~dp0node_modules\.bin\pm2"
if not defined PM2_CMD if not defined PM2_JS if exist "%~dp0node_modules\pm2\bin\pm2" set "PM2_JS=%~dp0node_modules\pm2\bin\pm2"
if not defined PM2_CMD if not defined PM2_JS (
  where pm2 >nul 2>nul
  if not errorlevel 1 set "PM2_CMD=pm2"
)
if not defined PM2_CMD if not defined PM2_JS if exist "%APPDATA%\npm\pm2.cmd" set "PM2_CMD=%APPDATA%\npm\pm2.cmd"
if not defined PM2_CMD if not defined PM2_JS if exist "%APPDATA%\npm\node_modules\pm2\bin\pm2" set "PM2_JS=%APPDATA%\npm\node_modules\pm2\bin\pm2"

if defined PM2_CMD "%PM2_CMD%" delete api-plus-webtools
if defined PM2_JS if defined NODE_EXE "%NODE_EXE%" "%PM2_JS%" delete api-plus-webtools

set "FOUND="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  set "MATCH="
  for /f "usebackq delims=" %%C in (`powershell -NoProfile -Command "$process = Get-CimInstance Win32_Process -Filter 'ProcessId=%%P'; if ($process.CommandLine -and $process.CommandLine -like '*server.cjs*' -and $process.CommandLine -like '*%~dp0server.cjs*') { 'MATCH' }"`) do set "MATCH=%%C"
  if defined MATCH (
    set "FOUND=1"
    echo Stopping local server PID %%P...
    taskkill /PID %%P /F >nul 2>nul
  )
)

if not defined FOUND echo No matching local server is listening on port %PORT%.
pause
