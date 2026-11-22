param([switch]$VerifyBrowsers)

$ErrorActionPreference = "Stop"
$setup = Join-Path $PSScriptRoot "../../ca/setup.ps1"
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($setup, [ref]$null, [ref]$parseErrors)
if ($parseErrors) { throw ($parseErrors.Message -join "`n") }

foreach ($name in @("Ensure-TestingStack", "Install-MissingExtras", "Write-RunScript")) {
  $definition = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
  }, $true)
  . ([scriptblock]::Create($definition.Extent.Text))
}

function Step([string]$Message) {}
function Info([string]$Message) { $script:messages += $Message }
function HasCmd([string]$Name) { return $false }

$AgentRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("code agent " + [guid]::NewGuid())
$messages = @()
try {
  New-Item -ItemType Directory -Path $AgentRoot | Out-Null
  Write-RunScript $AgentRoot "qwen2.5-coder:3b"
  $runner = Join-Path $AgentRoot "run.ps1"
  $parseErrors = $null
  $null = [System.Management.Automation.Language.Parser]::ParseFile($runner, [ref]$null, [ref]$parseErrors)
  if ($parseErrors) { throw ($parseErrors.Message -join "`n") }
  Write-Host "PASS: generated launcher parses in PowerShell"

  & {
    $state = @{ stopped = $false; foreign = $true; opened = $false }
    $ui = New-Item -ItemType Directory -Path (Join-Path $AgentRoot "app/ui") -Force
    $serverPath = Join-Path $ui.FullName "server.mjs"
    Set-Content -LiteralPath (Join-Path $ui.FullName "open-app.ps1") -Value 'param($Port); $state.opened = $true'
    function Invoke-WebRequest {
      param($Uri, $OutFile, [switch]$UseBasicParsing, $TimeoutSec)
      if ($Uri -like "https:*") { throw "offline fixture" }
    }
    function Get-NetTCPConnection {
      param($LocalPort, $State, $OwningProcess, $ErrorAction)
      if ($OwningProcess -eq 42) { return [pscustomobject]@{ OwningProcess = 42 } }
      return [pscustomobject]@{ OwningProcess = 41 }
    }
    function Get-CimInstance {
      param($ClassName, $Filter)
      $scriptName = if ($state.foreign) { "$serverPath-other" } else { $serverPath }
      return @{ Name = "node.exe"; CommandLine = "node `"$scriptName`" --port 7843" }
    }
    function Stop-Process {
      param($Id)
      if ($Id -ne 41) { throw "Stopped the wrong process" }
      $state.stopped = $true
    }
    function Wait-Process { param($Id, $Timeout, $ErrorAction) }
    function Start-Process {
      param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, [switch]$PassThru)
      if (-not $state.stopped) { throw "Old listener was not stopped" }
      if ($ArgumentList[0] -ne "`"$serverPath`"") { throw "Path with spaces was not quoted" }
      return @{ Id = 42; HasExited = $false }
    }
    $originalPath = $env:Path
    try {
      $blocked = $false
      try { & $runner } catch {
        if ($_.Exception.Message -notmatch "in use by another program") { throw }
        $blocked = $true
      }
      if (-not $blocked -or $state.stopped -or $state.opened) { throw "Launcher did not protect a foreign listener" }
      $state.foreign = $false
      & $runner
      if (-not $state.stopped -or -not $state.opened) { throw "Launcher did not replace and open the updated server" }
    } finally {
      $env:Path = $originalPath
    }
  }
  Write-Host "PASS: launcher replaces the installed server and leaves other listeners alone"

  $cliDir = Join-Path $AgentRoot "app/ui/node_modules/playwright-core"
  New-Item -ItemType Directory -Path $cliDir -Force | Out-Null
  $cli = Join-Path $cliDir "cli.js"
  Set-Content -LiteralPath $cli -Value @'
const fs = require("node:fs");
fs.writeFileSync(require("node:path").join(__dirname, "args.log"), process.argv.slice(2).join(" "));
process.exit(7);
'@
  Ensure-TestingStack
  $actual = Get-Content -LiteralPath (Join-Path $cliDir "args.log") -Raw
  if ($actual -ne "install chromium") { throw "The pinned Playwright CLI was not called with the expected arguments." }
  if (-not ($messages -match "Playwright browser install exited 7")) { throw "Optional browser download failure was not reported." }
  Write-Host "PASS: Node runs the pinned optional browser CLI, and failure is nonfatal"

  Ensure-TestingStack -Browsers @("chromium", "firefox", "webkit")
  $actual = Get-Content -LiteralPath (Join-Path $cliDir "args.log") -Raw
  if ($actual -ne "install chromium firefox webkit") { throw "Extras did not request all three Playwright browsers." }

  & {
    $calls = [System.Collections.Generic.List[string]]::new()
    $state = @{ virtualBoxInstalled = $false }
    $script:messages = @()
    function HasCmd([string]$Name) { return $Name -eq "winget.exe" }
    function Test-Path { return $false }
    function winget.exe {
      $calls.Add(($args -join " "))
      switch ($args[2]) {
        "Docker.DockerDesktop" { $global:LASTEXITCODE = 0 }
        "Oracle.VirtualBox" {
          if ($args[0] -eq "install") { $state.virtualBoxInstalled = $true }
          $global:LASTEXITCODE = if ($state.virtualBoxInstalled) { 0 } else { [int]0x8A150014 }
        }
        "Google.PlatformTools" { $global:LASTEXITCODE = 1 }
        default { throw "Unexpected package: $($args[2])" }
      }
    }
    Install-MissingExtras
    Install-MissingExtras
    $installs = @($calls | Where-Object { $_ -like "install *" })
    if ($installs.Count -ne 1 -or $installs[0] -ne "install --id Oracle.VirtualBox --exact --source winget --interactive") {
      throw "Extras must install only confirmed missing tools, without accepting license terms."
    }
    if (-not ($messages -match "Docker Desktop already installed") -or -not ($messages -match "Could not check whether Android platform-tools")) {
      throw "Extras did not report installed or unverified tools."
    }
  }
  Write-Host "PASS: extras skip installed tools, install missing tools once, and report unavailable checks"

  if ($VerifyBrowsers) {
    $runtime = Join-Path $PSScriptRoot "../chat-ui/node_modules/playwright-core"
    Remove-Item -LiteralPath $cliDir -Recurse -Force
    Copy-Item -LiteralPath $runtime -Destination $cliDir -Recurse
    $messages = @()
    Ensure-TestingStack
    $env:CA_SETUP_TEST_EDGE = if ("Chromium ready" -in $messages) { "0" } else { "1" }

    $browserCheck = Join-Path $AgentRoot "app/ui/check-browsers.cjs"
    Set-Content -LiteralPath $browserCheck -Value @'
const assert = require("node:assert/strict");
const playwright = require("playwright-core");

(async () => {
  const options = process.env.CA_SETUP_TEST_EDGE === "1" ? { channel: "msedge" } : {};
  const browser = await playwright.chromium.launch(options);
  try {
    const page = await browser.newPage();
    await page.setContent("<title>Code Agent browser check</title>");
    assert.equal(await page.title(), "Code Agent browser check");
    console.log("PASS: installed Chromium or Edge launched and rendered a page");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
'@
    & node $browserCheck
    if ($LASTEXITCODE -ne 0) { throw "One or more optional Playwright browsers failed to launch." }
  }
} finally {
  Remove-Item -LiteralPath $AgentRoot -Recurse -Force
}

exit 0
