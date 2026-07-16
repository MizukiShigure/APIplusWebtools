param(
  [Parameter(Mandatory = $true)]
  [int]$Port,
  [Parameter(Mandatory = $true)]
  [string]$ProjectServerPath
)

$expectedPath = [System.IO.Path]::GetFullPath($ProjectServerPath)
$connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
$projectPids = @()
$hasOtherListener = $false

foreach ($ownerProcessId in @($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerProcessId" -ErrorAction SilentlyContinue
  $commandLine = [string]$process.CommandLine
  if ($commandLine -and $commandLine.IndexOf($expectedPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
    $projectPids += $ownerProcessId
  } else {
    $hasOtherListener = $true
  }
}

if ($projectPids.Count -gt 0) {
  Write-Output "PROJECT_PIDS=$($projectPids -join ',')"
}

if ($hasOtherListener) {
  Write-Output "HAS_OTHER_LISTENER=1"
}
