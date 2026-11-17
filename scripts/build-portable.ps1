[CmdletBinding()]
param(
  [string]$OutputPath,
  [string]$NodeRuntimePath,
  [string]$NodeLicensePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$utf8 = [System.Text.UTF8Encoding]::new($false)
$repoRoot = Split-Path -Parent $PSScriptRoot
$version = [System.IO.File]::ReadAllText((Join-Path $repoRoot "VERSION"), $utf8).Trim()

$runtimeInfo = $null
if (-not [string]::IsNullOrWhiteSpace($NodeRuntimePath)) {
  if (-not (Test-Path -LiteralPath $NodeRuntimePath -PathType Leaf)) { throw "NodeRuntimePath does not exist." }
  if ([string]::IsNullOrWhiteSpace($NodeLicensePath) -or -not (Test-Path -LiteralPath $NodeLicensePath -PathType Leaf)) { throw "NodeLicensePath is required for runtime redistribution." }
  $NodeRuntimePath = (Resolve-Path -LiteralPath $NodeRuntimePath).Path
  $NodeLicensePath = (Resolve-Path -LiteralPath $NodeLicensePath).Path
  $runtimeInfo = (& $NodeRuntimePath -p 'JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch})') | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $runtimeInfo.platform -ne "win32" -or $runtimeInfo.arch -ne "x64" -or [int]($runtimeInfo.version.Split('.')[0]) -lt 20) {
    throw "The portable runtime must be Windows x64 Node.js 20 or newer."
  }
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  $runtimeStream = [System.IO.File]::OpenRead($NodeRuntimePath)
  try {
    $runtimeHash = [System.BitConverter]::ToString($hasher.ComputeHash($runtimeStream)).Replace("-", "").ToLowerInvariant()
  } finally {
    $runtimeStream.Dispose()
    $hasher.Dispose()
  }
  $runtimeInfo | Add-Member -NotePropertyName sha256 -NotePropertyValue $runtimeHash
}

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
  "Setup_Workbench.ps1",
  "Setup_Workbench.bat",
  "scripts/workbench-manage.cjs",
  "scripts/check-public-source.cjs",
  "workbench-manage.test.cjs",
  "workbench-sync-integration.test.cjs",
  "docs/GIT_WORKFLOW.md",
  ".gitignore",
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "README.md",
  "README_START.txt",
  "VERSION",
  "local-event-store.cjs",
  "local-event-store.test.cjs",
  "model-contracts.js",
  "prompt-detail-utils.js",
  "agent-app-integration.test.cjs",
  "agent-runtime-load.test.cjs",
  "agent-runtime-reconnect.test.cjs",
  "agent-runtime.js",
  "agent-runtime.test.cjs",
  "agent-service.cjs",
  "agent-service.test.cjs",
  "agent-skill-package.test.cjs",
  "agent-task-adapter.js",
  "agent-task-adapter.test.cjs",
  "agent-headless.cjs",
  "local-media-metadata.cjs",
  "local-media-metadata.test.cjs",
  "agent-headless.test.cjs",
  "headless-client.test.cjs",
  "workbench-model-catalog.cjs",
  "workbench-model-catalog.test.cjs",
  "workbench-browser-client.js",
  "workbench-browser-client.test.cjs",
  "workbench-ui-integration.test.cjs",
  "agent-audio-adapter.test.cjs",
  "audio-models.js",
  "audio-models.test.cjs",
  "audio-workbench-ui.js",
  "audio-workbench-ui.css",
  "audio-workbench-ui.test.cjs",
  "audio-workbench-browser.test.cjs",
  "kling-edit-ui.test.cjs",
  "skill-release.test.cjs",
  "history-audit.test.cjs",
  "agent-ui-contract.test.cjs",
  "agent-worker-integration.test.cjs",
  "avatar-workflow-store.cjs",
  "avatar-workflow-store.test.cjs",
  "avatar-workflow-media.cjs",
  "avatar-workflow-media.test.cjs",
  "avatar-workflow-service.cjs",
  "avatar-workflow-service.test.cjs",
  "avatar-workflow-server.test.cjs",
  "avatar-workflow-ui.js",
  "avatar-workflow-production.js",
  "avatar-workflow-production.test.cjs",
  "avatar-workflow-production-races.test.cjs",
  "avatar-workflow-ui.css",
  "avatar-workflow-ui.test.cjs",
  "avatar-workflow-browser.test.cjs",
  "runninghub-shared.js",
  "runninghub-shared.test.cjs",
  "app.js",
  "asset-history-integration.test.cjs",
  "asset-history-utils.js",
  "asset-history-utils.test.cjs",
  "asset-picker-ui-contract.test.cjs",
  "asset-upload-flow.test.cjs",
  "styles.css",
  "index.html",
  "server-agent-integration.test.cjs",
  "server.cjs",
  "skills/api-plus-agent/SKILL.md",
  "skills/api-plus-agent/agents/openai.yaml",
  "skills/api-plus-agent/references/agent-api.md",
  "skills/api-plus-agent/references/avatar-workflow.md",
  "skills/api-plus-agent/references/portable-setup.md",
  "skills/api-plus-agent/scripts/run-workbench.ps1",
  "skills/api-plus-agent/scripts/api-plus-agent-client.mjs",
  "history-bridge.html",
  "ecosystem.config.cjs",
  "launcher-port-query.ps1",
  "launcher-node.ps1",
  "portable-runtime.test.cjs",
  "launcher-pm2-owner.ps1",
  "Start_API_Tool.bat",
  "Stop_API_Tool.bat",
  "Make_Portable_Package.bat",
  "Update_From_Git.bat",
  "Restore_Version.bat",
  "start_multimodal_video_dev.bat",
  "package.json",
  "scripts/build-portable.ps1",
  "scripts/build-skills.ps1",
  "docs/ARCHITECTURE.md",
  "docs/AVATAR_WORKFLOW.md",
  "docs/superpowers/specs/2026-09-20-avatar-workflow-design.md",
  "docs/superpowers/specs/2026-09-20-avatar-independent-stages-design.md",
  "docs/DEVELOPMENT.md",
  "docs/API_INTEGRATION.md",
  "docs/DATA_AND_PRIVACY.md",
  "docs/RELEASE_CHECKLIST.md",
  "docs/LOCAL_DEPLOYMENT.md",
  "docs/AGENT_DEPLOYMENT.md",
  "launcher-agent-data.test.cjs",
  "launcher-contract.test.cjs",
  "history-origin-sync.test.cjs",
  "history-origin-utils.js",
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
  "midjourney-model-versions.test.cjs",
  "queue-refresh-resume.test.cjs",
  "row-completion-time.test.cjs",
  "models-25.test.cjs",
  "models-25-integration.test.cjs",
  "asset-picker-layout.test.cjs",
  "prompt-edit-performance.test.cjs",
  "history-performance.test.cjs",
  "history-performance-browser.test.cjs",
  "prompt-library.js",
  "prompt-library-panel.js",
  "prompt-library.css",
  "prompt-library-store.cjs",
  "prompt-library.test.cjs",
  "prompt-library-store.test.cjs",
  "video-model-defaults.test.cjs",
  "runninghub-auth.cjs",
  "runninghub-auth.test.cjs",
  "docs/MODELS_AND_PROMPT_LIBRARY.md"
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

  if ($null -ne $runtimeInfo) {
    Copy-Item -LiteralPath $NodeRuntimePath -Destination (Join-Path $stage "runtime/node.exe")
    Copy-Item -LiteralPath $NodeLicensePath -Destination (Join-Path $stage "runtime/LICENSE")
    $manifest = [ordered]@{ version = $version; builtAt = [DateTime]::UtcNow.ToString("o"); runtime = $runtimeInfo }
    [System.IO.File]::WriteAllText((Join-Path $stage "PORTABLE_BUILD.json"), ($manifest | ConvertTo-Json -Depth 5), $utf8)
  }

  $archiveItems = @(Get-ChildItem -LiteralPath $stage -Force | Select-Object -ExpandProperty FullName)
  $archiveCreated = $false
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      if (Test-Path -LiteralPath $temporaryArchive) {
        Remove-Item -LiteralPath $temporaryArchive -Force
      }
      Compress-Archive -LiteralPath $archiveItems -DestinationPath $temporaryArchive -Force
      $archiveCreated = $true
      break
    } catch {
      if ($attempt -ge 5) { throw }
      Start-Sleep -Milliseconds (200 * $attempt)
    }
  }
  if (-not $archiveCreated -or -not (Test-Path -LiteralPath $temporaryArchive -PathType Leaf)) {
    throw "Portable archive build did not produce a ZIP file."
  }

  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  Copy-Item -LiteralPath $temporaryArchive -Destination $OutputPath -Force
  Write-Output "Wrote $OutputPath"
} finally {
  if (Test-Path -LiteralPath $stage) {
    $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
    if ((Split-Path -Parent $resolvedStage) -ine $tempRoot -or (Split-Path -Leaf $resolvedStage) -notmatch '^internal-api-batch-portable-[a-f0-9]{32}$') {
      throw "Refusing cleanup outside the expected temporary build directory."
    }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  }
  if (Test-Path -LiteralPath $temporaryArchive) {
    Remove-Item -LiteralPath $temporaryArchive -Force
  }
}
