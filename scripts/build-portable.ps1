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

try {
  $OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
} catch {
  throw "OutputPath is invalid: $OutputPath"
}

if ([System.IO.Path]::GetExtension($OutputPath) -ine ".zip") {
  throw "OutputPath must use a .zip extension."
}

if (Test-Path -LiteralPath $OutputPath -PathType Container) {
  throw "OutputPath must be a ZIP file, not a directory."
}

$outputDirectory = Split-Path -Parent $OutputPath
if ([string]::IsNullOrWhiteSpace($outputDirectory)) {
  throw "OutputPath must include a directory."
}

$publicFiles = @(
  ".gitignore",
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "README.md",
  "README_START.txt",
  "VERSION",
  "model-contracts.js",
  "prompt-detail-utils.js",
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
  "Make_Portable_Package.bat",
  "Update_From_Git.bat",
  "Restore_Version.bat",
  "start_multimodal_video_dev.bat",
  "package.json",
  "scripts/build-portable.ps1",
  "docs/ARCHITECTURE.md",
  "docs/DEVELOPMENT.md",
  "docs/API_INTEGRATION.md",
  "docs/DATA_AND_PRIVACY.md",
  "docs/RELEASE_CHECKLIST.md",
  "launcher-contract.test.cjs",
  "history-recovery.test.cjs",
  "history-viewer-group-navigation.test.cjs",
  "portable-package.test.cjs",
  "prompt-detail-utils.test.cjs",
  "prompt-detail-panel.test.cjs",
  "compact-model-params-layout.test.cjs",
  "ui-layout-contract.test.cjs",
  "runtime-behavior.test.cjs",
  "dirty-row-state.test.cjs",
  "dirty-row-clear.test.cjs",
  "model-contracts.test.cjs",
  "queue-refresh-resume.test.cjs",
  "row-completion-time.test.cjs"
)

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("internal-api-batch-portable-" + [guid]::NewGuid().ToString("N"))
$temporaryArchive = Join-Path ([System.IO.Path]::GetTempPath()) ("internal-api-batch-portable-" + [guid]::NewGuid().ToString("N") + ".zip")

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

  foreach ($directory in @("data", "runtime")) {
    $keepDirectory = Join-Path $stage $directory
    New-Item -ItemType Directory -Path $keepDirectory -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $keepDirectory ".keep") -Force | Out-Null
  }

  $archiveItems = @(Get-ChildItem -LiteralPath $stage -Force | Select-Object -ExpandProperty FullName)
  Compress-Archive -LiteralPath $archiveItems -DestinationPath $temporaryArchive -Force
  if (-not (Test-Path -LiteralPath $temporaryArchive -PathType Leaf)) {
    throw "Portable archive build did not produce a ZIP file."
  }

  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  Copy-Item -LiteralPath $temporaryArchive -Destination $OutputPath -Force
  Write-Output "Wrote $OutputPath"
} finally {
  if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
  if (Test-Path -LiteralPath $temporaryArchive) {
    Remove-Item -LiteralPath $temporaryArchive -Force
  }
}
