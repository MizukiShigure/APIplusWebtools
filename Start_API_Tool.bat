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

set "PM2_FOUND="
if defined PM2_CMD set "PM2_FOUND=1"
if defined PM2_JS set "PM2_FOUND=1"

if defined PM2_FOUND (
  call :QUERY_PM2_OWNER
  if /I "%PM2_OWNER%"=="conflict" goto PM2_CONFLICT
  if /I "%PM2_OWNER%"=="current" goto START_PM2
  call :QUERY_LISTENER
  if defined HAS_OTHER_LISTENER goto PORT_CONFLICT
  if defined PROJECT_PIDS (
    echo Replacing the existing local fallback server...
    for %%P in (%PROJECT_PIDS:,= %) do taskkill /PID %%P /F >nul 2>nul
    timeout /t 1 /nobreak >nul
  )
  if defined LEGACY_PIDS (
    call :CONFIRM_LEGACY_MIGRATION
    if errorlevel 1 exit /b 1
  )
  goto START_PM2
)

call :QUERY_LISTENER
if defined HAS_OTHER_LISTENER goto PORT_CONFLICT
if defined LEGACY_PIDS goto LEGACY_CONFLICT
if defined PROJECT_PIDS goto OPEN_PAGE

start "Internal API Batch Server" /min "%NODE_EXE%" "%~dp0server.cjs"
echo Starting local server...
for /l %%I in (1,1,20) do (
  timeout /t 1 /nobreak >nul
  call :QUERY_LISTENER
  if defined HAS_OTHER_LISTENER goto PORT_CONFLICT
  if defined PROJECT_PIDS goto OPEN_PAGE
)
echo Server did not start. Check whether port %PORT% is occupied.
pause
exit /b 1

:QUERY_PM2_OWNER
set "PM2_OWNER=none"
for /f "tokens=1,2 delims==" %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher-pm2-owner.ps1" -Pm2Cmd "%PM2_CMD%" -Pm2Js "%PM2_JS%" -NodeExe "%NODE_EXE%" -ProjectRoot "%~dp0" -ProjectServerPath "%~dp0server.cjs"') do (
  if /I "%%A"=="PM2_OWNER" set "PM2_OWNER=%%B"
)
exit /b 0

:START_PM2
if defined PM2_CMD "%PM2_CMD%" startOrReload ecosystem.config.cjs --only api-plus-webtools --update-env
if defined PM2_JS "%NODE_EXE%" "%PM2_JS%" startOrReload ecosystem.config.cjs --only api-plus-webtools --update-env
if errorlevel 1 (
  echo PM2 could not start api-plus-webtools.
  pause
  exit /b 1
)
goto OPEN_PAGE

:QUERY_LISTENER
set "PROJECT_PIDS="
set "LEGACY_PIDS="
set "HAS_OTHER_LISTENER="
for /f "tokens=1,2 delims==" %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher-port-query.ps1" -Port %PORT% -ProjectServerPath "%~dp0server.cjs"') do (
  if /I "%%A"=="PROJECT_PIDS" set "PROJECT_PIDS=%%B"
  if /I "%%A"=="LEGACY_PIDS" set "LEGACY_PIDS=%%B"
  if /I "%%A"=="HAS_OTHER_LISTENER" if "%%B"=="1" set "HAS_OTHER_LISTENER=1"
)
exit /b 0

:CONFIRM_LEGACY_MIGRATION
call :SHOW_LEGACY_COMMAND_LINES
echo Legacy listener PID(s): %LEGACY_PIDS%
choice /C YN /N /M "Stop these legacy server.cjs process(es) and migrate to PM2"
if errorlevel 2 exit /b 1
for %%P in (%LEGACY_PIDS:,= %) do taskkill /PID %%P /F >nul 2>nul
timeout /t 1 /nobreak >nul
exit /b 0

:SHOW_LEGACY_COMMAND_LINES
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher-port-query.ps1" -Port %PORT% -ProjectServerPath "%~dp0server.cjs" -ShowLegacyCommandLines
exit /b 0

:PM2_CONFLICT
echo PM2 app api-plus-webtools belongs to another project directory.
pause
exit /b 1

:LEGACY_CONFLICT
echo Legacy server.cjs listener PID(s): %LEGACY_PIDS%
echo PM2 is unavailable, so the legacy listener was not stopped.
pause
exit /b 1

:PORT_CONFLICT
echo Port %PORT% is already in use by another program.
pause
exit /b 1

:OPEN_PAGE
echo Internal API Batch is running at %URL%
start "" "%URL%"
exit /b 0
