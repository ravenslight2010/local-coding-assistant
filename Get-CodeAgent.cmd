@echo off
setlocal EnableExtensions
title Get Code Agent

set "VERSION=4a3a9b5e1326f76bcabea74bcecf5aa9ff42007c"
set "EXPECTED=19dc5561206b772340f061b35e3537b93ad9724200dbc7adb1576d94f07a0a64"
set "AGENT=C:\runcalc\agent"
set "SOURCE=%AGENT%\source\%VERSION%"
set "STARTUP="
set "MODEL="

:parse
if "%~1"=="" goto done
if /i "%~1"=="/startup" set "STARTUP=-AddStartup"
if /i "%~1"=="/model" ( set "MODEL=%~2" & shift )
shift
goto parse
:done

net session >nul 2>&1
if not %errorlevel%==0 (
  echo Requesting Administrator...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  exit /b
)

mkdir "%AGENT%\logs" 2>nul
mkdir "%AGENT%\source" 2>nul

echo Downloading verified Code Agent source %VERSION%...
powershell -NoProfile -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$archive=Join-Path $env:TEMP 'code-agent-%VERSION%.zip';" ^
  "Invoke-WebRequest -Uri 'https://codeload.github.com/ravenslight2010/local-coding-assistant/zip/%VERSION%' -OutFile $archive -UseBasicParsing;" ^
  "$actual=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant();" ^
  "if ($actual -ne '%EXPECTED%') { throw 'Code Agent source SHA-256 mismatch' };" ^
  "if (-not (Test-Path -LiteralPath '%SOURCE%')) {" ^
  "  $extract=Join-Path $env:TEMP ([Guid]::NewGuid().ToString());" ^
  "  Expand-Archive -LiteralPath $archive -DestinationPath $extract;" ^
  "  Move-Item -LiteralPath (Join-Path $extract 'local-coding-assistant-%VERSION%') -Destination '%SOURCE%';" ^
  "}"
if errorlevel 1 (
  echo Download or verification failed. Check internet access and try again.
  pause
  exit /b 1
)

if defined MODEL (
  powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%SOURCE%\scripts\ca\setup.ps1" -RepoRoot "%SOURCE%" -AgentRoot "%AGENT%" %STARTUP% -LaunchChat -Model "%MODEL%"
) else (
  powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%SOURCE%\scripts\ca\setup.ps1" -RepoRoot "%SOURCE%" -AgentRoot "%AGENT%" %STARTUP% -LaunchChat
)
set "EC=%ERRORLEVEL%"
echo.
if %EC%==0 (echo Setup OK) else (echo Setup FAILED - see %AGENT%\logs)
pause
exit /b %EC%
