[CmdletBinding()]
param(
  [ValidateSet('setup', 'sync', 'doctor', 'stop', 'open')][string]$Action = 'setup',
  [string]$SkillsDir,
  [int]$Port,
  [string]$DataDir
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$repoRoot = $PSScriptRoot
$node = Join-Path $repoRoot 'runtime/node.exe'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
  $installed = Get-Command node -ErrorAction SilentlyContinue
  if ($installed) { $node = $installed.Source }
}
$usable = $false
if (Test-Path -LiteralPath $node -PathType Leaf) {
  $major = & $node -p 'process.versions.node.split(".")[0]'
  $usable = $LASTEXITCODE -eq 0 -and [int]$major -ge 20
}
if (-not $usable) {
  if ($Action -eq 'stop' -or $Action -eq 'doctor') { throw 'Node.js 20+ is missing. Run setup first.' }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
  $base = 'https://nodejs.org/dist/latest-v24.x'
  $stage = Join-Path $repoRoot ('.workbench-downloads/node-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  $checksums = Join-Path $stage 'SHASUMS256.txt'
  Write-Host 'Installing a private Node.js runtime from nodejs.org...'
  Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt" -OutFile $checksums
  $pattern = '^([a-f0-9]{64})\s+(node-v24\.[0-9]+\.[0-9]+-win-' + $architecture + '\.zip)$'
  $match = @(Get-Content -LiteralPath $checksums -Encoding UTF8 | Where-Object { $_ -match $pattern })
  if ($match.Count -ne 1) { throw 'Could not identify the official Node.js archive.' }
  $null = $match[0] -match $pattern
  $expected = $Matches[1]
  $name = $Matches[2]
  $archive = Join-Path $stage $name
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$name" -OutFile $archive
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $expected) { throw 'Node.js archive checksum mismatch.' }
  # Extract only the runtime and license; npm's deeply nested paths can exceed
  # Windows PowerShell 5.1's path limit in recipient directories with long names.
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($archive)
  $prefix = [IO.Path]::GetFileNameWithoutExtension($name)
  try {
    foreach ($item in @('node.exe', 'LICENSE')) {
      $entry = $zip.GetEntry("$prefix/$item")
      if (-not $entry) { throw "Official runtime archive is missing $item" }
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $stage $item), $false)
    }
  } finally { $zip.Dispose() }
  $runtime = Join-Path $repoRoot 'runtime'
  New-Item -ItemType Directory -Path $runtime -Force | Out-Null
  $node = Join-Path $runtime 'node.exe'
  if (Test-Path -LiteralPath $node) { throw 'An unsupported private runtime already exists. Preserve it before replacing it.' }
  Copy-Item -LiteralPath (Join-Path $stage 'node.exe') -Destination $node
  Copy-Item -LiteralPath (Join-Path $stage 'LICENSE') -Destination (Join-Path $runtime 'LICENSE')
}
$arguments = @((Join-Path $repoRoot 'scripts/workbench-manage.cjs'))
if ($Action -eq 'open') {
  & $node @arguments cli start
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $details = (& $node @arguments doctor) | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Start-Process ("http://127.0.0.1:{0}/" -f $details.port)
  exit 0
}
$arguments += $Action
if ($SkillsDir) { $arguments += @('--skills-dir', $SkillsDir) }
if ($Port) { $arguments += @('--port', [string]$Port) }
if ($DataDir) { $arguments += @('--data-dir', $DataDir) }
& $node @arguments
exit $LASTEXITCODE
