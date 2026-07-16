@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".git" (
  echo This folder is not a Git checkout.
  echo To use update pulling, clone the repository first:
  echo git clone git@github.com:MizukiShigure/APIplusWebtools.git
  pause
  exit /b 1
)

git --version >nul 2>nul
if errorlevel 1 (
  echo Git was not found. Please install Git for Windows first.
  pause
  exit /b 1
)

echo Pulling latest version...
git pull --ff-only
if errorlevel 1 (
  echo Update failed. If you have local changes, commit or stash them first.
  pause
  exit /b 1
)

echo Updated. Restart the local server if it is currently running.
pause
