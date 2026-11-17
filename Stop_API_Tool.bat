@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if exist "%~dp0.workbench-local.json" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup_Workbench.ps1" -Action stop
  exit /b
)
if not defined PORT set "PORT=4198"
set "NODE_EXE="
set "PM2_CMD="
set "PM2_JS="

if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"

if exist "%~dp0runtime\node.exe" if /I not "%API_BATCH_USE_PM2%"=="1" goto STOP_LOCAL

if exist "%~dp0node_modules\.bin\pm2.cmd" set "PM2_CMD=%~dp0node_modules\.bin\pm2.cmd"
if not defined PM2_CMD if exist "%~dp0node_modules\.bin\pm2" set "PM2_JS=%~dp0node_modules\.bin\pm2"
if not defined PM2_CMD if not defined PM2_JS if exist "%~dp0node_modules\pm2\bin\pm2" set "PM2_JS=%~dp0node_modules\pm2\bin\pm2"
if not defined PM2_CMD if not defined PM2_JS (
  where pm2 >nul 2>nul
  if not errorlevel 1 set "PM2_CMD=pm2"
)
if not defined PM2_CMD if not defined PM2_JS if exist "%APPDATA%\npm\pm2.cmd" set "PM2_CMD=%APPDATA%\npm\pm2.cmd"
if not defined PM2_CMD if not defined PM2_JS if exist "%APPDATA%\npm\node_modules\pm2\bin\pm2" set "PM2_JS=%APPDATA%\npm\node_modules\pm2\bin\pm2"

set "PM2_OWNER=none"
if defined PM2_CMD call :QUERY_PM2_OWNER
if defined PM2_JS if defined NODE_EXE call :QUERY_PM2_OWNER
if /I "%PM2_OWNER%"=="conflict" goto PM2_CONFLICT
if /I "%PM2_OWNER%"=="current" (
  if defined PM2_CMD "%PM2_CMD%" delete api-plus-webtools
  if defined PM2_JS if defined NODE_EXE "%NODE_EXE%" "%PM2_JS%" delete api-plus-webtools
)

:STOP_LOCAL
call :QUERY_LISTENER
if defined HAS_OTHER_LISTENER echo Port %PORT% is in use by another program and was not stopped.
if defined LEGACY_PIDS (
  call :CONFIRM_LEGACY_STOP
  if errorlevel 1 goto FINISH
)
if defined PROJECT_PIDS (
  for %%P in (%PROJECT_PIDS:,= %) do (
    echo Stopping local server PID %%P...
    taskkill /PID %%P /F >nul 2>nul
  )
) else (
  if not defined HAS_OTHER_LISTENER if not defined LEGACY_PIDS echo No matching local server is listening on port %PORT%.
)
:FINISH
if /I not "%API_BATCH_NO_PAUSE%"=="1" pause
exit /b 0

:QUERY_PM2_OWNER
set "PM2_OWNER=none"
for /f "tokens=1,2 delims==" %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher-pm2-owner.ps1" -Pm2Cmd "%PM2_CMD%" -Pm2Js "%PM2_JS%" -NodeExe "%NODE_EXE%" -ProjectRoot "%~dp0" -ProjectServerPath "%~dp0server.cjs"') do (
  if /I "%%A"=="PM2_OWNER" set "PM2_OWNER=%%B"
)
exit /b 0

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

:CONFIRM_LEGACY_STOP
call :SHOW_LEGACY_COMMAND_LINES
echo Legacy listener PID(s): %LEGACY_PIDS%
choice /C YN /N /M "Stop these legacy server.cjs process(es)"
if errorlevel 2 exit /b 1
for %%P in (%LEGACY_PIDS:,= %) do (
  echo Stopping legacy local server PID %%P...
  taskkill /PID %%P /F >nul 2>nul
)
exit /b 0

:SHOW_LEGACY_COMMAND_LINES
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher-port-query.ps1" -Port %PORT% -ProjectServerPath "%~dp0server.cjs" -ShowLegacyCommandLines
exit /b 0

:PM2_CONFLICT
echo PM2 app api-plus-webtools belongs to another project directory.
pause
exit /b 1
