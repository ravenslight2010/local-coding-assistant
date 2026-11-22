@echo off
setlocal EnableExtensions
title Get Code Agent
echo Code Agent installer/updater v4
echo Source pin: %VERSION%

set "VERSION=d6dfc1c48349bf30de8d27766750fd55c6a748cc"
set "EXPECTED=c911bd8003375841af6c7a9d27f462177f30dd0d69ecfb9987811aba0f39127b"
set "AGENT=C:\runcalc\agent"
set "SOURCE=%AGENT%\source\%VERSION%"
set "STARTUP="
set "MODEL="
set "TESTBROWSERS="

:parse
if "%~1"=="" goto done
if /i "%~1"=="/startup" set "STARTUP=-AddStartup"
if /i "%~1"=="/testbrowsers" set "TESTBROWSERS=-InstallTestBrowsers"
if /i "%~1"=="/model" ( set "MODEL=%~2" & shift )
shift
goto parse
:done

net session >nul 2>&1
if not %errorlevel%==0 (
  echo.
  echo This setup needs Administrator.
  echo A Windows prompt should appear. Click Yes.
  echo.
  echo Set UAC = CreateObject^("Shell.Application"^) > "%TEMP%\ca-elevate.vbs"
  echo UAC.ShellExecute "%~f0", "%*", "", "runas", 1 >> "%TEMP%\ca-elevate.vbs"
  cscript //nologo "%TEMP%\ca-elevate.vbs"
  del "%TEMP%\ca-elevate.vbs" 2>nul
  exit /b
)

mkdir "%AGENT%\logs" 2>nul
mkdir "%AGENT%\source" 2>nul

set "MODE=Installing"
if exist "%AGENT%\app\ui\server.mjs" set "MODE=Updating"
echo %MODE% Code Agent...
echo Config, memory, and secrets are kept.

echo Downloading verified Code Agent source %VERSION%...
set "CA_VERSION=%VERSION%"
powershell -NoProfile -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$archive=Join-Path $env:TEMP 'code-agent-%VERSION%.zip';" ^
  "Invoke-WebRequest -Uri 'https://codeload.github.com/ravenslight2010/local-coding-assistant/zip/%VERSION%' -OutFile $archive -UseBasicParsing;" ^
  "$actual=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant();" ^
  "if ($actual -ne '%EXPECTED%') { throw 'Code Agent source SHA-256 mismatch' };" ^
  "if (Test-Path -LiteralPath '%SOURCE%') { Remove-Item -LiteralPath '%SOURCE%' -Recurse -Force };" ^
  "$extract=Join-Path $env:TEMP ([Guid]::NewGuid().ToString());" ^
  "Expand-Archive -LiteralPath $archive -DestinationPath $extract;" ^
  "Move-Item -LiteralPath (Join-Path $extract 'local-coding-assistant-%VERSION%') -Destination '%SOURCE%';"
if errorlevel 1 (
  echo Download or verification failed. Check internet access and try again.
  pause
  exit /b 1
)

if defined MODEL (
  powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%SOURCE%\scripts\ca\setup.ps1" -RepoRoot "%SOURCE%" -AgentRoot "%AGENT%" %STARTUP% %TESTBROWSERS% -LaunchChat -Model "%MODEL%"
) else (
  powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%SOURCE%\scripts\ca\setup.ps1" -RepoRoot "%SOURCE%" -AgentRoot "%AGENT%" %STARTUP% %TESTBROWSERS% -LaunchChat
)
set "EC=%ERRORLEVEL%"
echo.
if %EC%==0 (echo %MODE% OK) else (echo %MODE% FAILED - see %AGENT%\logs)
pause
exit /b %EC%
