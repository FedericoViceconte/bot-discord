@echo off
setlocal
pushd "%~dp0..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 24.17 o superior desde https://nodejs.org/
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>24||(a===24&&b>=17)?0:1)"
if errorlevel 1 (
  echo Se necesita Node.js 24.17 o superior.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 (
  echo No se pudieron instalar las dependencias. Revisa tu conexion.
  pause
  exit /b 1
)
echo.
echo Listo. Abri 2-CONFIGURAR.cmd y segui docs\instalacion.md.
popd
pause
