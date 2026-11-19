#Requires -Version 5.1
# Compatibility entry point. The canonical installer is setup.ps1.
[CmdletBinding()]
param(
  [string]$BundleRoot = "",
  [string]$AgentRoot = "C:\runcalc\agent"
)
if (-not $BundleRoot) { $BundleRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..")) }
& (Join-Path $PSScriptRoot "setup.ps1") -RepoRoot $BundleRoot -AgentRoot $AgentRoot -LaunchChat
exit $LASTEXITCODE
