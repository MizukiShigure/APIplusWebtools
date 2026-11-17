[CmdletBinding()]
param(
  [string]$OutputDirectory,
  [string]$NodeRuntimePath,
  [string]$NodeLicensePath,
  [switch]$IncludeLocalSkill
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
function Get-Sha256([string]$FilePath) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($FilePath)
  try { return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $algorithm.Dispose() }
}
$repoRoot = Split-Path -Parent $PSScriptRoot
$version = [System.IO.File]::ReadAllText((Join-Path $repoRoot 'VERSION'), $utf8).Trim()
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Join-Path $repoRoot ('dist/skills-' + $version) }
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
if ([string]::IsNullOrWhiteSpace($NodeRuntimePath)) { $NodeRuntimePath = Join-Path $repoRoot 'runtime/node.exe' }
if ([string]::IsNullOrWhiteSpace($NodeLicensePath)) { $NodeLicensePath = Join-Path $repoRoot 'runtime/LICENSE' }
if (-not (Test-Path -LiteralPath $NodeRuntimePath -PathType Leaf) -or -not (Test-Path -LiteralPath $NodeLicensePath -PathType Leaf)) {
  throw 'Full skill releases require an explicit Windows Node runtime and its license.'
}
$portableFiles = @('SKILL.md', 'agents/openai.yaml', 'references/agent-api.md', 'references/avatar-workflow.md', 'references/portable-setup.md', 'scripts/api-plus-agent-client.mjs', 'scripts/run-workbench.ps1')
$localFiles = @('SKILL.md', 'agents/openai.yaml', 'scripts/workbench.ps1')
$targets = @('api-plus-agent', ('api-plus-agent-' + $version + '.zip'), 'SKILL_RELEASE.json')
if ($IncludeLocalSkill) { $targets += @('local-api-workbench', ('local-api-workbench-' + $version + '.zip')) }
foreach ($target in $targets) {
  if (Test-Path -LiteralPath (Join-Path $OutputDirectory $target)) { throw "Release target already exists: $target. Choose a new output directory." }
}
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('api-plus-skill-build-' + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $stage | Out-Null
  $portableRoot = Join-Path $stage 'api-plus-agent'
  foreach ($file in $portableFiles) {
    $destination = Join-Path $portableRoot $file
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path (Join-Path $repoRoot 'skills/api-plus-agent') $file) -Destination $destination
  }
  New-Item -ItemType Directory -Path (Join-Path $portableRoot 'assets') | Out-Null
  $nestedArchive = Join-Path $portableRoot 'assets/workbench.zip'
  & (Join-Path $PSScriptRoot 'build-portable.ps1') -OutputPath $nestedArchive -NodeRuntimePath $NodeRuntimePath -NodeLicensePath $NodeLicensePath
  $nestedHash = Get-Sha256 $nestedArchive
  $manifest = [ordered]@{ version = $version; archive = 'workbench.zip'; sha256 = $nestedHash; platform = 'win32'; arch = 'x64' }
  [System.IO.File]::WriteAllText((Join-Path $portableRoot 'assets/workbench-manifest.json'), ($manifest | ConvertTo-Json), $utf8)
  $portableZip = 'api-plus-agent-' + $version + '.zip'
  Compress-Archive -LiteralPath $portableRoot -DestinationPath (Join-Path $stage $portableZip)
  $artifacts = @([ordered]@{ name = $portableZip; sha256 = (Get-Sha256 (Join-Path $stage $portableZip)); containsWorkbench = $true })
  if ($IncludeLocalSkill) {
    $localRoot = Join-Path $stage 'local-api-workbench'
    foreach ($file in $localFiles) {
      $destination = Join-Path $localRoot $file
      New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
      Copy-Item -LiteralPath (Join-Path (Join-Path $repoRoot 'skills/local-api-workbench') $file) -Destination $destination
    }
    $localZip = 'local-api-workbench-' + $version + '.zip'
    Compress-Archive -LiteralPath $localRoot -DestinationPath (Join-Path $stage $localZip)
    $artifacts += [ordered]@{ name = $localZip; sha256 = (Get-Sha256 (Join-Path $stage $localZip)); containsWorkbench = $false; machineSpecific = $true }
  }
  $release = [ordered]@{ version = $version; builtAt = [DateTime]::UtcNow.ToString('o'); artifacts = $artifacts }
  [System.IO.File]::WriteAllText((Join-Path $stage 'SKILL_RELEASE.json'), ($release | ConvertTo-Json -Depth 5), $utf8)
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
  foreach ($target in $targets) { Copy-Item -LiteralPath (Join-Path $stage $target) -Destination (Join-Path $OutputDirectory $target) -Recurse }
  Write-Output "Wrote skill release to $OutputDirectory"
} finally {
  if (Test-Path -LiteralPath $stage) {
    $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
    if ((Split-Path -Parent $resolvedStage) -ine $tempRoot -or (Split-Path -Leaf $resolvedStage) -notmatch '^api-plus-skill-build-[a-f0-9]{32}$') { throw 'Refusing cleanup outside the skill build temporary directory.' }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  }
}
