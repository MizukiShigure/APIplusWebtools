@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".git" (
  echo This folder is not a Git checkout.
  pause
  exit /b 1
)

git --version >nul 2>nul
if errorlevel 1 (
  echo Git was not found. Please install Git for Windows first.
  pause
  exit /b 1
)

echo Available versions:
git tag --sort=-creatordate
echo.
set /p "TARGET_TAG=Type version tag to restore, for example v2026.07.16-portable.1: "
if "%TARGET_TAG%"=="" (
  echo No version selected.
  pause
  exit /b 1
)

git checkout "%TARGET_TAG%"
if errorlevel 1 (
  echo Restore failed. Check the tag name or local changes.
  pause
  exit /b 1
)

echo Restored to %TARGET_TAG%.
echo You are now on a detached tag version. To return to latest main, run:
echo git switch main
pause
