param(
  [Parameter(Mandatory = $true)]
  [int]$Port,
  [Parameter(Mandatory = $true)]
  [string]$ProjectServerPath,
  [switch]$ShowLegacyCommandLines
)

function Test-ExactCommandLineToken {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandLine,
    [Parameter(Mandatory = $true)]
    [string]$Token,
    [switch]$RequireQuotes
  )

  $escapedToken = [regex]::Escape($Token)
  if ($RequireQuotes) {
    $pattern = '(?<!\S)"' + $escapedToken + '"(?!\S)'
  } else {
    $pattern = '(?<!\S)(?:"' + $escapedToken + '"|' + $escapedToken + ')(?!\S)'
  }
  return [regex]::IsMatch($CommandLine, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
}

$expectedPath = [System.IO.Path]::GetFullPath($ProjectServerPath)
$expectedPathNeedsQuotes = $expectedPath -match '\s'
$connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
$projectPids = @()
$legacyPids = @()
$legacyListeners = @()
$hasOtherListener = $false

foreach ($ownerProcessId in @($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerProcessId" -ErrorAction SilentlyContinue
  $commandLine = [string]$process.CommandLine
  if ($process -and $process.Name -ieq "node.exe") {
    if (Test-ExactCommandLineToken -CommandLine $commandLine -Token $expectedPath -RequireQuotes:$expectedPathNeedsQuotes) {
      $projectPids += $ownerProcessId
    } elseif (Test-ExactCommandLineToken -CommandLine $commandLine -Token "server.cjs") {
      $legacyPids += $ownerProcessId
      $legacyListeners += [pscustomobject]@{ Pid = $ownerProcessId; CommandLine = $commandLine }
    } else {
      $hasOtherListener = $true
    }
  } else {
    $hasOtherListener = $true
  }
}

if ($projectPids.Count -gt 0) {
  Write-Output "PROJECT_PIDS=$($projectPids -join ',')"
}

if ($legacyPids.Count -gt 0) {
  Write-Output "LEGACY_PIDS=$($legacyPids -join ',')"
}

if ($hasOtherListener) {
  Write-Output "HAS_OTHER_LISTENER=1"
}

if ($ShowLegacyCommandLines) {
  foreach ($legacyListener in $legacyListeners) {
    Write-Output "Legacy PID $($legacyListener.Pid): $($legacyListener.CommandLine)"
  }
}
