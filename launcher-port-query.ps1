param(
  [int]$Port,
  [Parameter(Mandatory = $true)]
  [string]$ProjectServerPath,
  [switch]$ShowLegacyCommandLines,
  [switch]$ClassifyOnly,
  [string]$ClassifyProcessName,
  [string]$ClassifyCommandLineBase64
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
  if ($entryScript -ieq "server.cjs") {
    return "LEGACY"
  }
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

$connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
$projectPids = @()
$legacyPids = @()
$legacyListeners = @()
$hasOtherListener = $false

foreach ($ownerProcessId in @($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerProcessId" -ErrorAction SilentlyContinue
  $commandLine = [string]$process.CommandLine
  $classification = Get-LauncherProcessClassification -ProcessName $process.Name -CommandLine $commandLine -ExpectedProjectServerPath $expectedPath
  if ($classification -eq "PROJECT") {
    $projectPids += $ownerProcessId
  } elseif ($classification -eq "LEGACY") {
    $legacyPids += $ownerProcessId
    $legacyListeners += [pscustomobject]@{ Pid = $ownerProcessId; CommandLine = $commandLine }
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
