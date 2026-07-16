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
if not defined NODE_EXE if exist "C:\Users\46055\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=C:\Users\46055\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined NODE_EXE (
  echo Node.js was not found.
  echo Please install Node.js or put node.exe in the runtime folder.
  pause
  exit /b 1
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
