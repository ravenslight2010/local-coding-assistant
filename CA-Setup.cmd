@echo off
setlocal EnableExtensions
title Code Agent Setup

set "AGENT=C:\runcalc\agent"
set "REPO=%~dp0"
set "SETUP=%~dp0scripts\ca\setup.ps1"
set "STARTUP="
set "LAUNCH=-LaunchChat"

:parse
if "%~1"=="" goto done
if /i "%~1"=="/startup" set "STARTUP=-AddStartup"
if /i "%~1"=="/nolaunch" set "LAUNCH=-NoLaunch"
shift
goto parse
:done

if not exist "%SETUP%" (
  echo Missing %SETUP%
  echo Extract the full Code Agent bundle and run this file from its root.
  pause
  exit /b 1
)

net session >nul 2>&1
if not %errorlevel%==0 (
  echo Requesting Administrator...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  exit /b
)

echo Source: %REPO%
echo Agent:  %AGENT%
powershell -NoProfile -ExecutionPolicy RemoteSigned -File "%SETUP%" -RepoRoot "%REPO%" -AgentRoot "%AGENT%" %STARTUP% %LAUNCH%
set "EC=%ERRORLEVEL%"
echo.
if %EC%==0 (echo Setup OK) else (echo Setup FAILED - see %AGENT%\logs)
pause
exit /b %EC%
