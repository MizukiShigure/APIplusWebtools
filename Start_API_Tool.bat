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

if not defined PM2_FOUND goto NODE_FALLBACK

call :QUERY_PM2_OWNER
if /I "%PM2_OWNER%"=="conflict" goto PM2_CONFLICT
call :QUERY_LISTENER
if defined QUERY_FAILED goto PORT_CHECK_FAILED
if defined HAS_OTHER_LISTENER goto PORT_CONFLICT
if defined TRUSTED_PROJECT_PIDS if /I "%PM2_OWNER%"=="current" goto START_PM2
if defined PROJECT_PIDS (
  echo Replacing the existing local fallback server...
  for %%P in (%PROJECT_PIDS:,= %) do taskkill /PID %%P /F >nul 2>nul
  timeout /t 1 /nobreak >nul
)
if /I "%PM2_OWNER%"=="current" goto START_PM2
goto START_PM2

:NODE_FALLBACK
call :QUERY_LISTENER
if defined QUERY_FAILED goto PORT_CHECK_FAILED
if defined HAS_OTHER_LISTENER goto PORT_CONFLICT
if defined PROJECT_PIDS goto OPEN_PAGE

start "Internal API Batch Server" /min "%NODE_EXE%" "%~dp0server.cjs"
echo Starting local server...
for /l %%I in (1,1,20) do (
  timeout /t 1 /nobreak >nul
  call :QUERY_LISTENER
  if defined QUERY_FAILED goto PORT_CHECK_FAILED
  if defined HAS_OTHER_LISTENER goto PORT_CONFLICT
  if defined PROJECT_PIDS goto OPEN_PAGE
)
echo Server did not start. Check whether port %PORT% is occupied.
pause
exit /b 1

:QUERY_PM2_OWNER
set "PM2_OWNER=none"
set "PM2_PIDS="
for /f "tokens=1,2 delims==" %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher-pm2-owner.ps1" -Pm2Cmd "%PM2_CMD%" -Pm2Js "%PM2_JS%" -NodeExe "%NODE_EXE%" -ProjectRoot "%~dp0" -ProjectServerPath "%~dp0server.cjs"') do (
  if /I "%%A"=="PM2_OWNER" set "PM2_OWNER=%%B"
  if /I "%%A"=="PM2_PIDS" set "PM2_PIDS=%%B"
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
call :QUERY_PM2_OWNER
if /I not "%PM2_OWNER%"=="current" goto PM2_VERIFY_FAILED
echo Verifying api-plus-webtools on port %PORT%...
for /l %%I in (1,1,20) do (
  timeout /t 1 /nobreak >nul
  call :QUERY_LISTENER
  if defined QUERY_FAILED goto PORT_CHECK_FAILED
  if defined HAS_OTHER_LISTENER goto PORT_CONFLICT
  if defined TRUSTED_PROJECT_PIDS goto OPEN_PAGE
)
echo PM2 started, but the verified project listener did not appear on port %PORT%.
pause
exit /b 1

:QUERY_LISTENER
set "PROJECT_PIDS="
set "TRUSTED_PROJECT_PIDS="
set "HAS_OTHER_LISTENER="
set "QUERY_FAILED="
for /f "tokens=1,2 delims==" %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher-port-query.ps1" -Port %PORT% -ProjectServerPath "%~dp0server.cjs" -TrustedProjectPids "%PM2_PIDS%"') do (
  if /I "%%A"=="PROJECT_PIDS" set "PROJECT_PIDS=%%B"
  if /I "%%A"=="TRUSTED_PROJECT_PIDS" set "TRUSTED_PROJECT_PIDS=%%B"
  if /I "%%A"=="HAS_OTHER_LISTENER" if "%%B"=="1" set "HAS_OTHER_LISTENER=1"
  if /I "%%A"=="QUERY_FAILED" if "%%B"=="1" set "QUERY_FAILED=1"
)
exit /b 0

:PM2_CONFLICT
echo PM2 app api-plus-webtools belongs to another project directory.
pause
exit /b 1

:PM2_VERIFY_FAILED
echo PM2 started api-plus-webtools, but its exact project ownership could not be verified.
pause
exit /b 1

:PORT_CHECK_FAILED
echo Port %PORT% could not be checked reliably. Startup was stopped for safety.
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
