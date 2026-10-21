@echo off
setlocal
pushd "%~dp0"
if not exist .env copy .env.example .env >nul
notepad.exe .env
popd
