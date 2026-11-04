@echo off
setlocal
pushd "%~dp0..\.."
call npm.cmd run register
popd
pause
