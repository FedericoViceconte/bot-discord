@echo off
setlocal
pushd "%~dp0"
call npm.cmd run invite
popd
pause
