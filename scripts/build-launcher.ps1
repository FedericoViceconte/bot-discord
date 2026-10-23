param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$buildRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) { $OutputPath = Join-Path $buildRoot 'Agente-Canino.exe' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw 'No se encontro el compilador de .NET Framework de Windows.' }
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 /debug- /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll ("/out:" + $OutputPath) (Join-Path $buildRoot 'launcher\AgenteCanino.cs')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el panel.' }
Write-Output "Panel compilado: $OutputPath"
