param([switch]$VerifyBrowsers)

$ErrorActionPreference = "Stop"
$setup = Join-Path $PSScriptRoot "../../ca/setup.ps1"
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($setup, [ref]$null, [ref]$parseErrors)
if ($parseErrors) { throw ($parseErrors.Message -join "`n") }

foreach ($name in @("Ensure-TestingStack", "Write-RunScript")) {
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
  if ($actual -ne "install chromium firefox webkit") { throw "The pinned Playwright CLI was not called with the expected arguments." }
  if (-not ($messages -match "Playwright browser install exited 7")) { throw "Optional browser download failure was not reported." }
  Write-Host "PASS: Node runs the pinned optional browser CLI, and failure is nonfatal"

  if ($VerifyBrowsers) {
    $runtime = Join-Path $PSScriptRoot "../chat-ui/node_modules/playwright-core"
    Remove-Item -LiteralPath $cliDir -Recurse -Force
    Copy-Item -LiteralPath $runtime -Destination $cliDir -Recurse
    $messages = @()
    Ensure-TestingStack
    if ("Playwright browsers ready" -notin $messages) { throw ($messages -join "`n") }

    $browserCheck = Join-Path $AgentRoot "app/ui/check-browsers.cjs"
    Set-Content -LiteralPath $browserCheck -Value @'
const assert = require("node:assert/strict");
const playwright = require("playwright-core");

(async () => {
  for (const name of ["chromium", "firefox", "webkit"]) {
    const browser = await playwright[name].launch();
    try {
      const page = await browser.newPage();
      await page.setContent("<title>Code Agent browser check</title>");
      assert.equal(await page.title(), "Code Agent browser check");
      console.log(`PASS: ${name} launched and rendered a page`);
    } finally {
      await browser.close();
    }
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
