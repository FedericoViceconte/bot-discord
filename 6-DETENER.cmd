@echo off
setlocal
pushd "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-background.ps1"
set "botExit=%errorlevel%"
popd
pause
exit /b %botExit%
