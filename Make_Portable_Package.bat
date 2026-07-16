@echo off
setlocal EnableExtensions
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $root=(Get-Location).Path; $stamp=Get-Date -Format 'yyyyMMdd_HHmmss'; $stage=Join-Path $env:TEMP ('Internal_API_Batch_Portable_'+$stamp); if(Test-Path $stage){Remove-Item -LiteralPath $stage -Recurse -Force}; New-Item -ItemType Directory -Path $stage | Out-Null; $files=@('.gitignore','VERSION','CHANGELOG.md','app.js','styles.css','index.html','server.cjs','ecosystem.config.cjs','history-bridge.html','Start_API_Tool.bat','Stop_API_Tool.bat','Update_From_Git.bat','Restore_Version.bat','start_multimodal_video_dev.bat','README.md','README_START.txt','package.json'); foreach($file in $files){Copy-Item -LiteralPath (Join-Path $root $file) -Destination $stage}; $dataDir=Join-Path $stage 'data'; $runtimeDir=Join-Path $stage 'runtime'; New-Item -ItemType Directory -Path $dataDir | Out-Null; New-Item -ItemType Directory -Path $runtimeDir | Out-Null; Set-Content -LiteralPath (Join-Path $dataDir '.keep') -Value '' -Encoding UTF8; Set-Content -LiteralPath (Join-Path $runtimeDir '.keep') -Value '' -Encoding UTF8; $outDir=Join-Path $root 'dist'; try { New-Item -ItemType Directory -Path $outDir -Force | Out-Null } catch { $outDir=Join-Path (Split-Path -Parent $root) 'dist'; New-Item -ItemType Directory -Path $outDir -Force | Out-Null }; $zip=Join-Path $outDir ('Internal_API_Batch_Portable_'+$stamp+'.zip'); Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force; Write-Host ('Wrote '+$zip)"

if errorlevel 1 (
  echo Package failed.
  pause
  exit /b 1
)

pause
