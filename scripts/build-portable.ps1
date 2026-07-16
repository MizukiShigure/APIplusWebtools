[CmdletBinding()]
param(
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$utf8 = [System.Text.UTF8Encoding]::new($false)
$repoRoot = Split-Path -Parent $PSScriptRoot
$version = [System.IO.File]::ReadAllText((Join-Path $repoRoot "VERSION"), $utf8).Trim()

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $repoRoot ("dist\\Internal_API_Batch_Portable_{0}.zip" -f $version)
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path (Get-Location).Path $OutputPath
}

$outputDirectory = Split-Path -Parent $OutputPath
if ([string]::IsNullOrWhiteSpace($outputDirectory)) {
  throw "OutputPath must include a directory."
}

$publicFiles = @(
  ".gitignore",
  "VERSION",
  "CHANGELOG.md",
  "model-contracts.js",
  "app.js",
  "styles.css",
  "index.html",
  "server.cjs",
  "history-bridge.html",
  "ecosystem.config.cjs",
  "launcher-port-query.ps1",
  "launcher-pm2-owner.ps1",
  "Start_API_Tool.bat",
  "Stop_API_Tool.bat",
  "Update_From_Git.bat",
  "Restore_Version.bat",
  "start_multimodal_video_dev.bat",
  "README.md",
  "README_START.txt",
  "package.json",
  "scripts/build-portable.ps1"
)

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("internal-api-batch-portable-" + [guid]::NewGuid().ToString("N"))

try {
  New-Item -ItemType Directory -Path $stage | Out-Null
  foreach ($relativePath in $publicFiles) {
    $sourcePath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Required portable file is missing: $relativePath"
    }

    $destinationPath = Join-Path $stage $relativePath
    $destinationDirectory = Split-Path -Parent $destinationPath
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
  }

  $stagedApp = Join-Path $stage "app.js"
  $appText = [System.IO.File]::ReadAllText($stagedApp, $utf8)
  $sanitizedAppText = [regex]::Replace($appText, '(?m)^const API_DEFAULT = "[^"]*";\r?$', 'const API_DEFAULT = "";')
  if ($sanitizedAppText -eq $appText) {
    throw "Unable to sanitize the portable API Base default."
  }
  [System.IO.File]::WriteAllText($stagedApp, $sanitizedAppText, $utf8)

  foreach ($directory in @("data", "runtime")) {
    $keepDirectory = Join-Path $stage $directory
    New-Item -ItemType Directory -Path $keepDirectory -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $keepDirectory ".keep") -Force | Out-Null
  }

  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
  }

  $archiveItems = @(Get-ChildItem -LiteralPath $stage -Force | Select-Object -ExpandProperty FullName)
  Compress-Archive -LiteralPath $archiveItems -DestinationPath $OutputPath -Force
  Write-Output "Wrote $OutputPath"
} finally {
  if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
}
