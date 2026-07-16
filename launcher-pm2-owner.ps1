param(
  [string]$Pm2Cmd,
  [string]$Pm2Js,
  [string]$NodeExe,
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,
  [Parameter(Mandatory = $true)]
  [string]$ProjectServerPath
)

function Normalize-PathValue([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return "" }
  return [System.IO.Path]::GetFullPath($PathValue).TrimEnd([char[]]('\', '/'))
}

if ([string]::IsNullOrWhiteSpace($Pm2Cmd) -and ([string]::IsNullOrWhiteSpace($Pm2Js) -or [string]::IsNullOrWhiteSpace($NodeExe))) {
  Write-Output "PM2_OWNER=none"
  exit 0
}

try {
  if (-not [string]::IsNullOrWhiteSpace($Pm2Cmd)) {
    $json = & $Pm2Cmd jlist 2>$null
  } else {
    $json = & $NodeExe $Pm2Js jlist 2>$null
  }
  if ($LASTEXITCODE -ne 0) { throw "PM2 jlist failed" }
  $apps = @($json | Out-String | ConvertFrom-Json)
} catch {
  Write-Output "PM2_OWNER=conflict"
  exit 0
}

$namedApps = @($apps | Where-Object { $_.name -eq "api-plus-webtools" })
if ($namedApps.Count -eq 0) {
  Write-Output "PM2_OWNER=none"
  exit 0
}

$expectedRoot = Normalize-PathValue $ProjectRoot
$expectedServer = Normalize-PathValue $ProjectServerPath
foreach ($app in $namedApps) {
  $pm2Env = $app.pm2_env
  $actualRoot = Normalize-PathValue ([string]$pm2Env.pm_cwd)
  $actualServer = Normalize-PathValue ([string]$pm2Env.pm_exec_path)
  if ($actualRoot -ine $expectedRoot -or $actualServer -ine $expectedServer) {
    Write-Output "PM2_OWNER=conflict"
    exit 0
  }
}

Write-Output "PM2_OWNER=current"
