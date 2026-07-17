param(
  [int]$Port,
  [Parameter(Mandatory = $true)]
  [string]$ProjectServerPath,
  [switch]$ShowLegacyCommandLines,
  [switch]$ClassifyOnly,
  [string]$ClassifyProcessName,
  [string]$ClassifyCommandLineBase64,
  [switch]$SkipGetNetTcpConnection,
  [string]$NetstatPath = "$env:SystemRoot\System32\netstat.exe",
  [string]$TrustedProjectPids
)

if (-not ("LauncherCommandLineNative" -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class LauncherCommandLineNative {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)] string commandLine, out int argumentCount);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr LocalFree(IntPtr memory);
}
'@
}

function ConvertFrom-WindowsCommandLine {
  param([Parameter(Mandatory = $true)][string]$CommandLine)

  $argumentCount = 0
  $argumentsMemory = [LauncherCommandLineNative]::CommandLineToArgvW($CommandLine, [ref]$argumentCount)
  if ($argumentsMemory -eq [IntPtr]::Zero -or $argumentCount -lt 1) {
    throw "CommandLineToArgvW could not parse the command line"
  }

  try {
    $arguments = for ($index = 0; $index -lt $argumentCount; $index++) {
      $argumentMemory = [Runtime.InteropServices.Marshal]::ReadIntPtr($argumentsMemory, [IntPtr]::Size * $index)
      if ($argumentMemory -eq [IntPtr]::Zero) { throw "CommandLineToArgvW returned an empty argument" }
      [Runtime.InteropServices.Marshal]::PtrToStringUni($argumentMemory)
    }
    return $arguments
  } finally {
    [void][LauncherCommandLineNative]::LocalFree($argumentsMemory)
  }
}

function Get-LauncherProcessClassification {
  param(
    [string]$ProcessName,
    [string]$CommandLine,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedProjectServerPath
  )

  $isNodeProcess = $ProcessName -ieq "node.exe"
  if (-not $isNodeProcess -or [string]::IsNullOrWhiteSpace($CommandLine)) {
    return "OTHER"
  }

  try {
    $argv = @(ConvertFrom-WindowsCommandLine $CommandLine)
  } catch {
    return "OTHER"
  }

  if ($argv.Count -lt 2 -or [string]::IsNullOrWhiteSpace($argv[1])) {
    return "OTHER"
  }

  $entryScript = $argv[1]
  if (-not [System.IO.Path]::IsPathRooted($entryScript)) {
    return "OTHER"
  }

  try {
    $normalizedEntryScript = [System.IO.Path]::GetFullPath($entryScript)
  } catch {
    return "OTHER"
  }

  if ($normalizedEntryScript -ieq $ExpectedProjectServerPath) {
    return "PROJECT"
  }
  return "OTHER"
}

function Get-NetstatListenerPids {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ExecutablePath,
    [Parameter(Mandatory = $true)]
    [int]$LocalPort
  )

  if ([string]::IsNullOrWhiteSpace($ExecutablePath) -or -not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
    throw "netstat.exe was not found"
  }

  $lines = @(& $ExecutablePath -ano -p TCP 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw "netstat.exe failed"
  }

  $listenerPids = @()
  foreach ($line in $lines) {
    if ([string]$line -notmatch '^\s*TCP\s+(?<LocalAddress>\S+)\s+\S+\s+LISTENING\s+(?<OwningProcess>\d+)\s*$') {
      continue
    }
    $localAddress = [string]$Matches.LocalAddress
    $ownerProcessId = [int]$Matches.OwningProcess
    if ($localAddress -notmatch ':(?<LocalPort>\d+)$') {
      continue
    }
    if ([int]$Matches.LocalPort -eq $LocalPort) {
      $listenerPids += $ownerProcessId
    }
  }

  return @($listenerPids | Sort-Object -Unique)
}

$expectedPath = [System.IO.Path]::GetFullPath($ProjectServerPath)
if ($ClassifyOnly) {
  try {
    $classifyCommandLine = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($ClassifyCommandLineBase64))
  } catch {
    Write-Output "OTHER"
    exit 0
  }
  Write-Output (Get-LauncherProcessClassification -ProcessName $ClassifyProcessName -CommandLine $classifyCommandLine -ExpectedProjectServerPath $expectedPath)
  exit 0
}

if ($Port -lt 1 -or $Port -gt 65535) {
  throw "Port must be between 1 and 65535"
}

$primaryProbeSucceeded = $false
$netstatProbeSucceeded = $false
$ownerProcessIds = @()

if (-not $SkipGetNetTcpConnection) {
  try {
    [void](Get-Command Get-NetTCPConnection -ErrorAction Stop)
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop)
    $primaryProbeSucceeded = $true
    $ownerProcessIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    $primaryProbeSucceeded = $false
  }
}

# An empty primary result is confirmed with netstat because NetTCPIP can be
# unavailable or access-limited in non-elevated Windows sessions.
if (-not $primaryProbeSucceeded -or $ownerProcessIds.Count -eq 0) {
  try {
    $ownerProcessIds = @(Get-NetstatListenerPids -ExecutablePath $NetstatPath -LocalPort $Port)
    $netstatProbeSucceeded = $true
  } catch {
    $netstatProbeSucceeded = $false
  }
}

$querySucceeded = ($primaryProbeSucceeded -and $ownerProcessIds.Count -gt 0) -or $netstatProbeSucceeded
if (-not $querySucceeded) {
  Write-Output "QUERY_FAILED=1"
  Write-Output "HAS_OTHER_LISTENER=1"
  exit 2
}

$trustedPidSet = [System.Collections.Generic.HashSet[int]]::new()
foreach ($trustedPidToken in @([string]$TrustedProjectPids -split ',')) {
  $trustedPid = 0
  if ([int]::TryParse($trustedPidToken.Trim(), [ref]$trustedPid) -and $trustedPid -gt 0) {
    [void]$trustedPidSet.Add($trustedPid)
  }
}

$projectPids = @()
$trustedListenerPids = @()
$hasOtherListener = $false

foreach ($ownerProcessId in $ownerProcessIds) {
  if ($trustedPidSet.Contains([int]$ownerProcessId)) {
    $projectPids += $ownerProcessId
    $trustedListenerPids += $ownerProcessId
    continue
  }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerProcessId" -ErrorAction SilentlyContinue
  $commandLine = [string]$process.CommandLine
  $classification = Get-LauncherProcessClassification -ProcessName $process.Name -CommandLine $commandLine -ExpectedProjectServerPath $expectedPath
  if ($classification -eq "PROJECT") {
    $projectPids += $ownerProcessId
  } else {
    $hasOtherListener = $true
  }
}

if ($projectPids.Count -gt 0) {
  Write-Output "PROJECT_PIDS=$($projectPids -join ',')"
}

if ($trustedListenerPids.Count -gt 0) {
  Write-Output "TRUSTED_PROJECT_PIDS=$($trustedListenerPids -join ',')"
}

if ($hasOtherListener) {
  Write-Output "HAS_OTHER_LISTENER=1"
}
