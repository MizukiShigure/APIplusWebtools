@echo off
setlocal
cd /d "%~dp0"
if not defined PORT set PORT=4198
echo Starting multimodal video dev tool at http://127.0.0.1:%PORT%/
echo Keep this window open while using the page.
start "" "http://127.0.0.1:%PORT%/?v=portable-20260716"
set BUNDLED_NODE=C:\Users\46055\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" server.cjs
) else (
  node server.cjs
)
