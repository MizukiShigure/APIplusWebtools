param(
  [string]$Pm2Cmd,
  [string]$Pm2Js,
  [string]$NodeExe,
  [string]$JsonFixturePath,
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,
  [Parameter(Mandatory = $true)]
  [string]$ProjectServerPath
)

$ErrorActionPreference = "Stop"

function Normalize-PathValue([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return "" }
  return [System.IO.Path]::GetFullPath($PathValue).TrimEnd([char[]]('\', '/'))
}

function Convert-Pm2JsonWithNode {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RawJson,
    [Parameter(Mandatory = $true)]
    [string]$NodeCommand
  )

  $temporaryJson = [System.IO.Path]::GetTempFileName()
  $temporaryParser = $temporaryJson + ".cjs"
  $utf8 = [System.Text.UTF8Encoding]::new($false)
  $parser = @'
const fs = require("fs");
const apps = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const compact = apps.map(app => ({
  name: app && app.name,
  pid: Number(app && app.pid || 0),
  pm2_env: {
    pm_cwd: app && app.pm2_env && app.pm2_env.pm_cwd,
    pm_exec_path: app && app.pm2_env && app.pm2_env.pm_exec_path
  }
}));
process.stdout.write(JSON.stringify(compact));
'@

  try {
    [System.IO.File]::WriteAllText($temporaryJson, $RawJson, $utf8)
    [System.IO.File]::WriteAllText($temporaryParser, $parser, $utf8)
    $compactJson = & $NodeCommand $temporaryParser $temporaryJson 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Node.js could not parse PM2 jlist" }
    $parsedApps = ($compactJson | Out-String) | ConvertFrom-Json
    foreach ($parsedApp in @($parsedApps)) {
      Write-Output $parsedApp
    }
  } finally {
    Remove-Item -LiteralPath $temporaryJson -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $temporaryParser -Force -ErrorAction SilentlyContinue
  }
}

if ([string]::IsNullOrWhiteSpace($JsonFixturePath) -and [string]::IsNullOrWhiteSpace($Pm2Cmd) -and [string]::IsNullOrWhiteSpace($Pm2Js)) {
  Write-Output "PM2_OWNER=none"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($NodeExe)) {
  Write-Output "PM2_OWNER=conflict"
  exit 0
}

try {
  if (-not [string]::IsNullOrWhiteSpace($JsonFixturePath)) {
    $rawJson = [System.IO.File]::ReadAllText($JsonFixturePath, [System.Text.Encoding]::UTF8)
  } elseif (-not [string]::IsNullOrWhiteSpace($Pm2Cmd)) {
    $json = & $Pm2Cmd jlist 2>$null
    if ($LASTEXITCODE -ne 0) { throw "PM2 jlist failed" }
    $rawJson = $json | Out-String
  } else {
    $json = & $NodeExe $Pm2Js jlist 2>$null
    if ($LASTEXITCODE -ne 0) { throw "PM2 jlist failed" }
    $rawJson = $json | Out-String
  }
  $apps = @(Convert-Pm2JsonWithNode -RawJson $rawJson -NodeCommand $NodeExe)
} catch {
  Write-Output "PM2_ERROR=$($_.Exception.Message)"
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
try {
  foreach ($app in $namedApps) {
    $pm2Env = $app.pm2_env
    $actualRoot = Normalize-PathValue ([string]$pm2Env.pm_cwd)
    $actualServer = Normalize-PathValue ([string]$pm2Env.pm_exec_path)
    if ($actualRoot -ine $expectedRoot -or $actualServer -ine $expectedServer) {
      Write-Output "PM2_OWNER=conflict"
      exit 0
    }
  }
} catch {
  Write-Output "PM2_ERROR=$($_.Exception.Message)"
  Write-Output "PM2_OWNER=conflict"
  exit 0
}

Write-Output "PM2_OWNER=current"
$verifiedPids = @($namedApps | ForEach-Object { [int]$_.pid } | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
Write-Output "PM2_PIDS=$($verifiedPids -join ',')"
