$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
function Get-Sha256([string]$FilePath) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($FilePath)
  try { return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $algorithm.Dispose() }
}
$skillRoot = Split-Path -Parent $PSScriptRoot
$workbenchRoot = $env:API_PLUS_WORKBENCH_ROOT
if ([string]::IsNullOrWhiteSpace($workbenchRoot)) {
  $checkoutRoot = Split-Path -Parent (Split-Path -Parent $skillRoot)
  if (Test-Path -LiteralPath (Join-Path $checkoutRoot 'server.cjs') -PathType Leaf) {
    $workbenchRoot = $checkoutRoot
  } else {
    $archive = Join-Path $skillRoot 'assets/workbench.zip'
    $manifestPath = Join-Path $skillRoot 'assets/workbench-manifest.json'
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf) -or -not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
      throw 'Use the full portable skill release or set API_PLUS_WORKBENCH_ROOT to an existing installation.'
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.version -notmatch '^v[0-9A-Za-z.-]+$') { throw 'Invalid embedded workbench version.' }
    if ((Get-Sha256 $archive) -ine $manifest.sha256) { throw 'Embedded workbench archive hash mismatch.' }
    $workbenchRoot = Join-Path (Join-Path $skillRoot 'workbench') $manifest.version
    if (-not (Test-Path -LiteralPath (Join-Path $workbenchRoot 'VERSION') -PathType Leaf)) {
      if (Test-Path -LiteralPath $workbenchRoot) { throw 'Incomplete embedded installation exists; preserve it and inspect before retrying.' }
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
      try {
        $destinationPrefix = [System.IO.Path]::GetFullPath($workbenchRoot).TrimEnd('\') + '\'
        foreach ($entry in $zip.Entries) {
          $destination = [System.IO.Path]::GetFullPath((Join-Path $workbenchRoot $entry.FullName))
          if (-not $destination.StartsWith($destinationPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe embedded archive entry.' }
        }
      } finally { $zip.Dispose() }
      Expand-Archive -LiteralPath $archive -DestinationPath $workbenchRoot
    }
    if ((Get-Content -LiteralPath (Join-Path $workbenchRoot 'VERSION') -Raw -Encoding UTF8).Trim() -ne $manifest.version) { throw 'Embedded installation version mismatch.' }
  }
}
$workbenchRoot = (Resolve-Path -LiteralPath $workbenchRoot).Path
$client = Join-Path $workbenchRoot 'skills/api-plus-agent/scripts/api-plus-agent-client.mjs'
if (-not (Test-Path -LiteralPath $client -PathType Leaf)) { throw 'Selected directory does not contain the API Plus Agent client.' }
$node = Join-Path $workbenchRoot 'runtime/node.exe'
if (Test-Path -LiteralPath $node -PathType Leaf) {
  $buildManifest = Join-Path $workbenchRoot 'PORTABLE_BUILD.json'
  if (Test-Path -LiteralPath $buildManifest -PathType Leaf) {
    $runtimeManifest = Get-Content -LiteralPath $buildManifest -Raw -Encoding UTF8 | ConvertFrom-Json
    if ((Get-Sha256 $node) -ine $runtimeManifest.runtime.sha256) { throw 'Bundled Node runtime hash mismatch.' }
  }
} else {
  $node = (Get-Command node -ErrorAction Stop).Source
}
$env:API_PLUS_WORKBENCH_ROOT = $workbenchRoot
& $node $client @args
exit $LASTEXITCODE
