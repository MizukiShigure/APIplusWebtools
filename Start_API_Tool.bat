@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not defined PORT set "PORT=4198"
set "URL=http://127.0.0.1:%PORT%/?v=portable-20260716"
set "NODE_EXE="

where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"

if not defined NODE_EXE if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"

if not defined NODE_EXE (
  echo Node.js was not found.
  echo Please install Node.js or put node.exe in the runtime folder.
  pause
  exit /b 1
)

set "PM2_CMD="
set "PM2_JS="
if exist "%~dp0node_modules\.bin\pm2.cmd" set "PM2_CMD=%~dp0node_modules\.bin\pm2.cmd"
if not defined PM2_CMD if exist "%~dp0node_modules\.bin\pm2" set "PM2_JS=%~dp0node_modules\.bin\pm2"
if not defined PM2_CMD if not defined PM2_JS if exist "%~dp0node_modules\pm2\bin\pm2" set "PM2_JS=%~dp0node_modules\pm2\bin\pm2"
if not defined PM2_CMD if not defined PM2_JS (
  where pm2 >nul 2>nul
  if not errorlevel 1 set "PM2_CMD=pm2"
)
if not defined PM2_CMD if not defined PM2_JS if exist "%APPDATA%\npm\pm2.cmd" set "PM2_CMD=%APPDATA%\npm\pm2.cmd"
if not defined PM2_CMD if not defined PM2_JS if exist "%APPDATA%\npm\node_modules\pm2\bin\pm2" set "PM2_JS=%APPDATA%\npm\node_modules\pm2\bin\pm2"

if defined PM2_CMD (
  "%PM2_CMD%" startOrReload ecosystem.config.cjs --only api-plus-webtools --update-env
  if errorlevel 1 (
    echo PM2 could not start api-plus-webtools.
    pause
    exit /b 1
  )
  goto OPEN_PAGE
)

if defined PM2_JS (
  "%NODE_EXE%" "%PM2_JS%" startOrReload ecosystem.config.cjs --only api-plus-webtools --update-env
  if errorlevel 1 (
    echo PM2 could not start api-plus-webtools.
    pause
    exit /b 1
  )
  goto OPEN_PAGE
)

set "SERVER_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do set "SERVER_PID=%%P"

if not defined SERVER_PID (
  start "Internal API Batch Server" /min "%NODE_EXE%" "%~dp0server.cjs"
  echo Starting local server...
  for /l %%I in (1,1,20) do (
    timeout /t 1 /nobreak >nul
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do set "SERVER_PID=%%P"
    if defined SERVER_PID goto OPEN_PAGE
  )
  echo Server did not start. Check whether port %PORT% is occupied.
  pause
  exit /b 1
)

:OPEN_PAGE
echo Internal API Batch is running at %URL%
start "" "%URL%"
exit /b 0
