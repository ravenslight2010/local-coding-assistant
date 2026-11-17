#Requires -Version 5.1
[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 7843,
  [ValidateRange(1, 120)]
  [int]$WaitSeconds = 30
)

$ErrorActionPreference = "Stop"
$url = "http://127.0.0.1:$Port/"
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$ready = $false

do {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {}
  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $deadline)

if (-not $ready) {
  Write-Error "Code Agent did not become ready at $url"
  exit 1
}

$edgePaths = @(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
)
$edge = $edgePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edge) {
  $edgeCommand = Get-Command msedge.exe -ErrorAction SilentlyContinue
  if ($edgeCommand) { $edge = $edgeCommand.Source }
}

if ($edge) {
  Start-Process -FilePath $edge -ArgumentList @("--app=$url")
} else {
  Start-Process -FilePath $url
}
