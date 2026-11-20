@echo off
setlocal EnableExtensions
title Get Code Agent

set "VERSION=8794cc3be232f4caf03faaff80919bd7d828a544"
set "EXPECTED=fe8732c760ca2ca67e784b0ef52fc1e1fea30f4e268db6bd2585e01d6eafd375"
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
  echo.
  echo This setup needs Administrator.
  echo A Windows prompt should appear. Click Yes.
  echo.
  powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs -ErrorAction Stop } catch { Write-Host 'Could not elevate:' $_.Exception.Message; exit 1 }"
  if errorlevel 1 (
    echo.
    echo Elevation failed.
    echo Right-click Get-CodeAgent.cmd and choose "Run as administrator".
    echo.
    pause
  )
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
