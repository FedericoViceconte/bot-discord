@echo off
setlocal
pushd "%~dp0"
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0scripts\handoff.ps1" -Mode import
set "botExit=%errorlevel%"
popd
pause
exit /b %botExit%
