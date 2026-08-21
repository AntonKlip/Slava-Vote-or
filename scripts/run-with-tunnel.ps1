# Local self-hosting supervisor: keeps `cloudflared tunnel` + the built `node dist/index.js`
# process alive, syncs the tunnel's (random, changes on every restart) URL into MINI_APP_URL.
# Not a hosting guarantee -- restarts on crash/reboot, does not protect against PC/network/Windows
# being down. See docs/DECISIONS.md and docs/ARCHITECTURE.md (hosting section).

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $projectRoot '.env'
$distEntry = Join-Path $projectRoot 'dist\index.js'
$logsDir = Join-Path $projectRoot 'logs'
$runDir = Join-Path $projectRoot 'run'
$logFile = Join-Path $logsDir 'supervisor.log'
$lockFile = Join-Path $runDir 'supervisor.lock'
$tunnelStdout = Join-Path $runDir 'cloudflared-stdout.log'
$tunnelStderr = Join-Path $runDir 'cloudflared-stderr.log'
$nodeStdout = Join-Path $runDir 'node-stdout.log'
$nodeStderr = Join-Path $runDir 'node-stderr.log'

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

function Write-Log([string]$message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message"
  Add-Content -Path $logFile -Value $line -Encoding utf8
}

# Two-layer duplicate protection: Task Scheduler's own MultipleInstances=IgnoreNew, plus this
# liveness+identity check for manual double-starts from a terminal.
if (Test-Path $lockFile) {
  $lockedPidRaw = (Get-Content $lockFile -Raw -ErrorAction SilentlyContinue)
  if ($lockedPidRaw) {
    $lockedPid = $lockedPidRaw.Trim()
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$lockedPid" -ErrorAction SilentlyContinue
    if ($existing -and $existing.CommandLine -match 'run-with-tunnel\.ps1') {
      Write-Log "Another supervisor instance is already running (PID $lockedPid) -- exiting."
      exit 0
    }
  }
}
$PID | Set-Content -Path $lockFile -Encoding utf8

if (-not (Test-Path $distEntry)) {
  Write-Log "dist/index.js not found at $distEntry -- run 'npm run build' first. Exiting."
  exit 1
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Log 'node.exe not found in PATH -- exiting.'
  exit 1
}
$nodePath = $nodeCmd.Source

$cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cfCmd) {
  $cloudflaredPath = $cfCmd.Source
} elseif (Test-Path 'C:\Program Files (x86)\cloudflared\cloudflared.exe') {
  $cloudflaredPath = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
} else {
  Write-Log 'cloudflared.exe not found (PATH or known winget install path) -- exiting.'
  exit 1
}

$apiPort = 3000
foreach ($envLine in (Get-Content $envPath -ErrorAction SilentlyContinue)) {
  if ($envLine -match '^API_PORT=(\d+)') { $apiPort = $matches[1] }
}

function Update-MiniAppUrl([string]$url) {
  $lines = Get-Content $envPath
  $found = $false
  $newLines = foreach ($line in $lines) {
    if ($line -match '^MINI_APP_URL=') { $found = $true; "MINI_APP_URL=$url" } else { $line }
  }
  if (-not $found) { $newLines += "MINI_APP_URL=$url" }
  $tmpPath = "$envPath.tmp"
  Set-Content -Path $tmpPath -Value $newLines -Encoding utf8
  Move-Item -Path $tmpPath -Destination $envPath -Force
}

function Stop-TrackedProcess($proc, [string]$name) {
  if ($null -eq $proc) { return }
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 20; $i++) {
    if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 500
  }
  Write-Log "$name (PID $($proc.Id)) stopped."
}

Write-Log 'Supervisor started.'

while ($true) {
  Write-Log "Starting cloudflared tunnel -> http://localhost:$apiPort"
  Remove-Item $tunnelStdout, $tunnelStderr -ErrorAction SilentlyContinue
  $tunnelProc = Start-Process -FilePath $cloudflaredPath `
    -ArgumentList @('tunnel', '--url', "http://localhost:$apiPort") `
    -RedirectStandardOutput $tunnelStdout -RedirectStandardError $tunnelStderr `
    -WorkingDirectory $projectRoot -NoNewWindow -PassThru

  $url = $null
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $text = (Get-Content $tunnelStdout -Raw -ErrorAction SilentlyContinue) + "`n" + (Get-Content $tunnelStderr -Raw -ErrorAction SilentlyContinue)
    if ($text -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $url = $matches[0]; break }
  }

  if (-not $url) {
    Write-Log 'Tunnel URL did not appear within 30s -- retrying.'
    Stop-TrackedProcess $tunnelProc 'cloudflared'
    Start-Sleep -Seconds 10
    continue
  }

  Write-Log "Tunnel URL: $url"
  Update-MiniAppUrl $url
  Write-Log 'MINI_APP_URL updated in .env.'

  Remove-Item $nodeStdout, $nodeStderr -ErrorAction SilentlyContinue
  $nodeProc = Start-Process -FilePath $nodePath -ArgumentList @($distEntry) `
    -RedirectStandardOutput $nodeStdout -RedirectStandardError $nodeStderr `
    -WorkingDirectory $projectRoot -NoNewWindow -PassThru
  Write-Log "node dist/index.js started (PID $($nodeProc.Id))."

  while ($true) {
    Start-Sleep -Seconds 10
    if (-not (Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue)) {
      Write-Log 'cloudflared exited unexpectedly.'
      break
    }
    if (-not (Get-Process -Id $nodeProc.Id -ErrorAction SilentlyContinue)) {
      Write-Log 'node exited unexpectedly.'
      break
    }
  }

  Stop-TrackedProcess $nodeProc 'node'
  Stop-TrackedProcess $tunnelProc 'cloudflared'
  Write-Log 'Restarting stack.'
  Start-Sleep -Seconds 5
}
