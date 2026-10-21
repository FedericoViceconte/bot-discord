@echo off
setlocal
pushd "%~dp0"
call npm.cmd start
popd
pause
