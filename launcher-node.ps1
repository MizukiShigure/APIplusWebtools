[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$NodeExe,
  [Parameter(Mandatory = $true)][string]$ProjectServerPath,
  [Parameter(Mandatory = $true)][string]$DataDir
)
$ErrorActionPreference = "Stop"
$server = (Resolve-Path -LiteralPath $ProjectServerPath).Path
$logDir = Join-Path $DataDir "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$process = Start-Process -FilePath $NodeExe -ArgumentList ('"' + $server + '"') -WorkingDirectory (Split-Path -Parent $server) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "server.out.log") -RedirectStandardError (Join-Path $logDir "server.err.log") -PassThru
Write-Output ("SERVER_PID=" + $process.Id)
