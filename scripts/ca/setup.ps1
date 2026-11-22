#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$AgentRoot = "C:\runcalc\agent",
  [switch]$LaunchChat,
  [switch]$NoLaunch,
  [switch]$AddStartup,
  [switch]$SkipSkillsInstall,
  [switch]$SkipModelPull,
  [switch]$InstallTestBrowsers,
  [ValidateSet("speed", "balanced")]
  [string]$ModelPolicy = "speed",
  [string]$Model = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$NodeVersion = "22.23.5"
$NodeMsiSha256 = "963a110509eca7e0d6cc009095ccb4117e26d59287876a056b79293ae3fef238"
$OllamaVersion = "0.40.16"
$OllamaSetupSha256 = "84db4f756ddc9e091142a85cdc0f7ae5db68bc9b3e075f114388b326f8ed912d"

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

$LogDir = Join-Path $AgentRoot "logs"
Ensure-Dir $LogDir
$LogFile = Join-Path $LogDir ("setup-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

function Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message
  Add-Content -LiteralPath $LogFile -Value $line
  Write-Host $line
}
function Step([string]$Message) { Write-Host ""; Log "==> $Message" }
function Info([string]$Message) { Log "    $Message" }
function Fail([string]$Message) { Log "FAIL: $Message"; throw $Message }
function HasCmd([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
  foreach ($candidate in @(
    "$env:ProgramFiles\nodejs",
    "$env:LOCALAPPDATA\Programs\Ollama",
    "$env:ProgramFiles\Ollama"
  )) {
    if ($candidate -and (Test-Path -LiteralPath $candidate) -and ($env:Path -notlike "*$candidate*")) {
      $env:Path = "$candidate;$env:Path"
    }
  }
}

function Get-Repo {
  if (-not $RepoRoot) { $RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..")) }
  $resolved = [IO.Path]::GetFullPath($RepoRoot)
  $server = Join-Path $resolved "scripts\coding-assistant\chat-ui\server.mjs"
  if (-not (Test-Path -LiteralPath $server)) {
    Fail "Invalid Code Agent source at $resolved; chat-ui\server.mjs is missing"
  }
  return $resolved
}

function Assert-Hash([string]$Path, [string]$Expected) {
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Expected.ToLowerInvariant()) { Fail "SHA-256 mismatch for $Path" }
}

function Download-Verified([string]$Uri, [string]$Destination, [string]$ExpectedHash) {
  Info "Downloading $Uri"
  Invoke-WebRequest -Uri $Uri -OutFile $Destination -UseBasicParsing
  Assert-Hash $Destination $ExpectedHash
}

function Enable-LongPaths {
  $key = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
  $current = (Get-ItemProperty -Path $key -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled
  if ($current -ne 1) {
    Set-ItemProperty -Path $key -Name LongPathsEnabled -Value 1 -Type DWord -Force
    Info "Enabled Windows long paths"
  }
}

function Ensure-Node {
  Refresh-Path
  Step "Node.js $NodeVersion"
  if (HasCmd "node") {
    $installed = (& node -p "process.versions.node").Trim()
    $major = 0
    [void][int]::TryParse($installed.Split('.')[0], [ref]$major)
    if ($major -ge 22) {
      Info "Using Node $installed"
      return
    }
    Fail "Node $installed is too old. Install Node 22 or newer."
  }

  if ([Environment]::Is64BitOperatingSystem -eq $false) { Fail "Node x64 setup requires 64-bit Windows" }
  $msi = Join-Path $env:TEMP "node-v$NodeVersion-x64.msi"
  Download-Verified "https://nodejs.org/download/release/v$NodeVersion/node-v$NodeVersion-x64.msi" $msi $NodeMsiSha256
  $process = Start-Process msiexec.exe -ArgumentList @("/i", "`"$msi`"", "/qn", "/norestart") -Wait -PassThru
  if ($process.ExitCode -notin @(0, 3010)) { Fail "Node installer exited with $($process.ExitCode)" }
  Refresh-Path
  if (-not (HasCmd "node")) { Fail "Node was installed but is not available on PATH; restart Windows and run setup again" }
  Info "Node $(& node -p 'process.versions.node') ready"
}

function Ensure-Ollama {
  Refresh-Path
  Step "Ollama $OllamaVersion"
  if (-not (HasCmd "ollama")) {
    $setup = Join-Path $env:TEMP "OllamaSetup-$OllamaVersion.exe"
    Download-Verified "https://github.com/ollama/ollama/releases/download/v$OllamaVersion/OllamaSetup.exe" $setup $OllamaSetupSha256
    $process = Start-Process -FilePath $setup -ArgumentList @("/VERYSILENT", "/NORESTART") -Wait -PassThru
    if ($process.ExitCode -ne 0) { Fail "Ollama installer exited with $($process.ExitCode)" }
    Refresh-Path
  } else {
    Info "Using the existing Ollama installation; setup does not replace it"
  }
  if (-not (HasCmd "ollama")) { Fail "Ollama is not available on PATH after installation" }

  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 4 | Out-Null
  } catch {
    Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(30)
    do {
      Start-Sleep -Milliseconds 500
      try { Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 2 | Out-Null; return } catch {}
    } while ((Get-Date) -lt $deadline)
    Fail "Ollama did not become ready on 127.0.0.1:11434"
  }
}

function Select-Model {
  if ($Model) {
    Info "Using requested model $Model"
    return $Model
  }
  . (Join-Path $PSScriptRoot "Choose-Model.ps1")
  $picked = Choose-Model
  Info "Selected $picked"
  Ensure-Dir (Join-Path $AgentRoot "config")
  @{ Model = $picked; remember = $true; Policy = $ModelPolicy } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $AgentRoot "config\model-choice.json") -Encoding UTF8
  return $picked
}

function Ensure-Model([string]$Model) {
  Step "Model $Model"
  if ($SkipModelPull) {
    $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
    if (-not ($tags.models.name -contains $Model)) { Fail "Model $Model is not installed and -SkipModelPull was requested" }
    return
  }
  & ollama pull $Model
  if ($LASTEXITCODE -ne 0) { Fail "ollama pull failed for $Model" }
  $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
  if (-not ($tags.models.name -contains $Model)) { Fail "Ollama did not report model $Model after download" }
  Info "Model verified"
}

function Copy-App([string]$Repo, [string]$Model) {
  Step "Application payload"
  $app = Join-Path $AgentRoot "app"
  Ensure-Dir $app
  $ui = Join-Path $app "ui"
  Ensure-Dir $ui
  Copy-Item -Path (Join-Path $Repo "scripts\coding-assistant\chat-ui\*") -Destination $ui -Recurse -Force
  Push-Location $ui
  try {
    & npm ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Fail "Browser test runtime installation failed" }
  } finally {
    Pop-Location
  }
  Set-Content -LiteralPath (Join-Path $app "package.json") -Value '{"name":"ca-agent","private":true}' -Encoding UTF8
  foreach ($name in @("server.mjs", "index.html", "chat-stream.mjs", "open-app.ps1")) {
    if (-not (Test-Path -LiteralPath (Join-Path $app "ui\$name"))) { Fail "Installed UI is missing $name" }
  }

  if (-not $SkipSkillsInstall) {
    $source = Join-Path $Repo "scripts\coding-assistant\domain-skills"
    if (Test-Path -LiteralPath $source) {
      $destination = Join-Path $env:USERPROFILE ".config\opencode\skills"
      Ensure-Dir $destination
      Copy-Item -Path "$source\*" -Destination $destination -Recurse -Force
    }
  }

  $context = Join-Path $AgentRoot "context"
  Ensure-Dir $context
  $contextSource = Join-Path $Repo "docs\coding-assistant\context"
  if (Test-Path -LiteralPath $contextSource) { Copy-Item -Path "$contextSource\*" -Destination $context -Recurse -Force }
  $memory = Join-Path $AgentRoot "config\MEMORY.md"
  if (-not (Test-Path -LiteralPath $memory)) { Set-Content -LiteralPath $memory -Value "# Project Memory`n`n" -Encoding UTF8 }

  Write-RunScript $Repo $Model
}

function Write-RunScript([string]$Repo, [string]$Model) {
  $pinDir = Join-Path $AgentRoot "source"
  if (-not (Test-Path $pinDir)) { New-Item -ItemType Directory -Path $pinDir | Out-Null }
  $ver = if ($env:CA_VERSION) { $env:CA_VERSION } else { "unknown" }
  Set-Content -LiteralPath (Join-Path $pinDir "pin.txt") -Value $ver -Encoding ASCII
  $run = Join-Path $AgentRoot "run.ps1"
  $app = Join-Path $AgentRoot "app"
  $lines = @(
    '$ErrorActionPreference = ''Stop'''
    "`$app = '$app'"
    "`$model = '$Model'"
    "`$repo = '$Repo'"
    '$port = 7843'
    '$env:Path = [Environment]::GetEnvironmentVariable(''Path'',''Machine'') + '';'' + [Environment]::GetEnvironmentVariable(''Path'',''User'')'
    'foreach ($p in @("$env:ProgramFiles\nodejs", "$env:LOCALAPPDATA\Programs\Ollama", "$env:ProgramFiles\Ollama")) { if (Test-Path $p) { $env:Path = "$p;$env:Path" } }'
    '$env:RUNCALC_REPO = $repo'
    '$env:CA_AGENT_ROOT = $PSScriptRoot'
    '$env:CA_ALLOW_SHELL = ''1'''
    '# Auto-update: if a newer pin is published, re-run Get-CodeAgent.cmd once'
    '$pinFile = Join-Path $PSScriptRoot ''source\pin.txt'''
    '$remote = ''https://raw.githubusercontent.com/ravenslight2010/local-coding-assistant/main/Get-CodeAgent.cmd'''
    'try {'
    '  $tmp = Join-Path $env:TEMP ''ca-remote.cmd'''
    '  Invoke-WebRequest $remote -OutFile $tmp -UseBasicParsing -TimeoutSec 8'
    '  $remoteVer = (Select-String -Path $tmp -Pattern ''set "VERSION=([a-f0-9]+)'' | Select-Object -First 1).Matches.Groups[1].Value'
    '  $localVer = if (Test-Path $pinFile) { (Get-Content $pinFile -Raw).Trim() } else { '''' }'
    '  if ($remoteVer -and $remoteVer -ne $localVer) {'
    '    Write-Host "Update available: $remoteVer"'
    '    & $tmp'
    '    exit 0'
    '  }'
    '} catch {}'
    'try { Invoke-WebRequest http://127.0.0.1:11434/api/tags -UseBasicParsing -TimeoutSec 2 | Out-Null } catch { Start-Process ollama -ArgumentList serve -WindowStyle Hidden; Start-Sleep 2 }'
    '$server = Join-Path $app ''ui\server.mjs'''
    'if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error ''Node missing. Run setup again.''; exit 1 }'
    '# An updated UI may otherwise be served by the old Node process.'
    '$serverArg = ''(?:^|\s)(?:"'' + [regex]::Escape($server) + ''"|'' + [regex]::Escape($server) + '')(?=\s|$)'''
    '$listenerIds = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)'
    'foreach ($listenerId in $listenerIds) {'
    '  $listener = Get-CimInstance Win32_Process -Filter "ProcessId = $listenerId"'
    '  if ($listener.Name -ne ''node.exe'' -or $listener.CommandLine -notmatch $serverArg) { throw "Port $port is in use by another program. Code Agent did not stop it." }'
    '}'
    'foreach ($listenerId in $listenerIds) {'
    '  Stop-Process -Id $listenerId'
    '  Wait-Process -Id $listenerId -Timeout 10 -ErrorAction SilentlyContinue'
    '}'
    '$proc = Start-Process node -ArgumentList @("`"$server`"", ''--port'', "$port", ''--model'', $model) -WorkingDirectory $app -WindowStyle Hidden -PassThru'
    '$deadline = (Get-Date).AddSeconds(15)'
    'do {'
    '  if ($proc.HasExited) { throw "Code Agent server exited before it was ready (code $($proc.ExitCode))." }'
    '  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -OwningProcess $proc.Id -ErrorAction SilentlyContinue'
    '  if ($listening) { break }'
    '  Start-Sleep -Milliseconds 250'
    '} while ((Get-Date) -lt $deadline)'
    'if (-not $listening) { throw "Code Agent server did not start listening on port $port." }'
    '& (Join-Path $app ''ui\open-app.ps1'') -Port $port'
    'Write-Host "Code Agent model=$model repo=$repo pid=$($proc.Id)"'
  )
  Set-Content -LiteralPath $run -Value $lines -Encoding UTF8
}

function Create-Shortcuts {
  Step "Shortcuts"
  $shell = New-Object -ComObject WScript.Shell
  $powerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $run = Join-Path $AgentRoot "run.ps1"
  $arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File `"$run`""
  $icon = Join-Path $AgentRoot "app\ui\icons\coding-assistant.ico"
  $locations = @(
    (Join-Path ([Environment]::GetFolderPath("Desktop")) "CodeAgent.lnk"),
    (Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs\CodeAgent.lnk")
  )
  if ($AddStartup) { $locations += Join-Path ([Environment]::GetFolderPath("Startup")) "CodeAgent.lnk" }
  foreach ($link in $locations) {
    Ensure-Dir (Split-Path $link -Parent)
    $shortcut = $shell.CreateShortcut($link)
    $shortcut.TargetPath = $powerShell
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $AgentRoot
    if (Test-Path -LiteralPath $icon) { $shortcut.IconLocation = "$icon,0" }
    $shortcut.Description = "Local Code Agent"
    $shortcut.Save()
  }
}

function Verify-Installation([string]$Model) {
  Step "Verification"
  Refresh-Path
  if (-not (HasCmd "node")) { Fail "Node missing after setup" }
  if (-not (HasCmd "ollama")) { Fail "Ollama missing after setup" }
  $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
  if (-not ($tags.models.name -contains $Model)) { Fail "Model $Model missing after setup" }
  foreach ($name in @("server.mjs", "index.html", "chat-stream.mjs", "open-app.ps1", "package.json", "package-lock.json")) {
    if (-not (Test-Path -LiteralPath (Join-Path $AgentRoot "app\ui\$name"))) { Fail "Installed file missing: $name" }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $AgentRoot "app\ui\node_modules\playwright-core\package.json"))) {
    Fail "Installed browser test runtime missing"
  }
  Info "Node, Ollama, model, and application payload verified"
}


function Ensure-TestingStack {
  Step "Free testing stack"
  # On Windows the coder launches Edge (channel: msedge). No Playwright browser download is needed.
  $edge = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  if ($edge) {
    Info "Using installed Microsoft Edge for browser tests: $edge"
  } else {
    Info "Microsoft Edge not found. Browser tests need Edge or CA_TEST_BROWSER_PATH."
  }
  $cli = Join-Path $AgentRoot "app/ui/node_modules/playwright-core/cli.js"
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if ((Test-Path -LiteralPath $cli -PathType Leaf) -and $node) {
    $cache = Join-Path $env:USERPROFILE "AppData\Local\ms-playwright"
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    foreach ($browser in @("chromium", "firefox", "webkit")) {
      $present = $false
      if (Test-Path -LiteralPath $cache) {
        $present = [bool](Get-ChildItem -LiteralPath $cache -Directory -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -like "$browser-*" })
      }
      if ($present) {
        Info "$browser already installed"
        continue
      }
      Info "Downloading Playwright $browser"
      & $node $cli install $browser 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) { Info "$browser ready" }
      else { Info "$browser download failed (exit $LASTEXITCODE); continuing" }
    }
    $ErrorActionPreference = $prev
  } else {
    Info "Playwright CLI or node missing; skipping browser downloads"
  }

  if (HasCmd "adb") { Info "Android platform-tools present" }
  else { Info "Android AVD not installed. Install Android Studio and create one AVD for real Android tests." }

  $hyperv = if (HasCmd "Get-WindowsOptionalFeature") {
    Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -ErrorAction SilentlyContinue
  }
  if ($hyperv -and $hyperv.State -eq "Enabled") { Info "Hyper-V available for Windows guests" }
  elseif (HasCmd "VBoxManage") { Info "VirtualBox available for OS guests" }
  else { Info "No free VM tool detected. Install VirtualBox or enable Hyper-V if you need OS guests." }
}




function Ensure-Docker {
  if (HasCmd "docker") { Info "Docker already installed"; return }
  Step "Docker Desktop"
  Info "Installing Docker Desktop"
  $installer = Join-Path $env:TEMP "DockerDesktopInstaller.exe"
  try {
    Invoke-WebRequest "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" -OutFile $installer -UseBasicParsing
    $p = Start-Process $installer -ArgumentList @("install", "--quiet", "--accept-license") -Wait -PassThru
    if ($p.ExitCode -eq 0) { Info "Docker Desktop installed; a reboot or manual start may be needed" }
    else { Info "Docker installer exited $($p.ExitCode); Windmill and Activepieces will be skipped" }
  } catch {
    Info "Docker install failed: $($_.Exception.Message)"
  }
  Refresh-Path
}

function Ensure-WorkflowTools {
  Step "Free workflow tools"
  # Node-RED: light, npm
  if (HasCmd "node-red") { Info "Node-RED already installed" }
  else {
    Info "Installing Node-RED"
    try {
      & npm.cmd install -g node-red
      if (HasCmd "node-red") { Info "Node-RED ready (run: node-red)" }
      else { Info "Node-RED install failed; continuing" }
    } catch {
      Info "Node-RED skipped: $($_.Exception.Message)"
    }
  }
  # Docker-based tools
  if (-not (HasCmd "docker")) { Info "Docker not found; skipping Windmill and Activepieces"; return }
  Info "Docker present; starting Windmill and Activepieces"
  $compose = Join-Path $AgentRoot "workflow-tools.yml"
  @"
services:
  windmill-db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: windmill
      POSTGRES_DB: windmill
    volumes: ["windmill-db:/var/lib/postgresql/data"]
  windmill:
    image: ghcr.io/windmill-labs/windmill:main
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgres://postgres:windmill@windmill-db/windmill?sslmode=disable
    depends_on: [windmill-db]
  activepieces:
    image: activepieces/activepieces:latest
    ports: ["8080:80"]
    environment:
      AP_ENGINE_EXECUTABLE_PATH: dist/packages/server/api/main.js
    volumes: ["activepieces:/root/.activepieces"]
volumes:
  windmill-db:
  activepieces:
"@ | Set-Content -LiteralPath $compose -Encoding ASCII
  try {
    & docker compose -f $compose up -d 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Info "Windmill on :8000, Activepieces on :8080" }
    else { Info "Docker compose failed; tools not started" }
  } catch {
    Info "Workflow containers skipped: $($_.Exception.Message)"
  }
}

try {
  Step "Code Agent Setup"
  $repo = Get-Repo
  Info "Source: $repo"
  Info "Agent: $AgentRoot"
  Enable-LongPaths
  Ensure-Node
  Ensure-Ollama
  $model = Select-Model
  Ensure-Model $model
  Copy-App $repo $model
  Ensure-TestingStack
  Ensure-Docker
  Ensure-WorkflowTools
  Create-Shortcuts
  Verify-Installation $model
  if ($LaunchChat -and -not $NoLaunch) {
    & powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File (Join-Path $AgentRoot "run.ps1")
    if ($LASTEXITCODE -ne 0) { Fail "Code Agent did not launch successfully." }
  }
  Info "Setup complete. Log: $LogFile"
  exit 0
} catch {
  Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Log: $LogFile"
  exit 1
}
