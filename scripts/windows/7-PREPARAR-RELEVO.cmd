@echo off
setlocal
pushd "%~dp0..\.."
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0..\handoff.ps1" -Mode export
set "botExit=%errorlevel%"
popd
pause
exit /b %botExit%
