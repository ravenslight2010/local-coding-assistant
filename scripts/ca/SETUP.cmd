@echo off
setlocal
set "ROOT=%~dp0..\.."
call "%ROOT%\CA-Setup.cmd" %*
exit /b %ERRORLEVEL%
