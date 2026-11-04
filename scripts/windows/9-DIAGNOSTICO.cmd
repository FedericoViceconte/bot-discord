@echo off
setlocal
pushd "%~dp0..\.."
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instala Node.js 24.17 o superior y abri 1-INSTALAR.cmd.
  pause
  exit /b 1
)
node.exe --env-file-if-exists=.env scripts/doctor.js
set "botExit=%errorlevel%"
popd
pause
exit /b %botExit%
