try {
    . (Join-Path $PSScriptRoot 'bot-process.ps1')
    Set-Location -LiteralPath $botRoot
    $existingProcess = Get-ManagedBotProcess
    if ($existingProcess) {
        Write-Host "Agente Canino ya se esta ejecutando. PID $($existingProcess.Id)"
        exit 0
    }
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Falta Node.js. Instala Node.js 24.17 o superior y ejecuta 1-INSTALAR.cmd.' }
    & node.exe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>24||(a===24&&b>=17)?0:1)"
    if ($LASTEXITCODE -ne 0) { throw 'Actualiza Node.js: el bot necesita 24.17 o superior. Despues abri 1-INSTALAR.cmd.' }
    & node.exe --env-file-if-exists=.env scripts/doctor.js
    if ($LASTEXITCODE -ne 0) { throw 'El bot no se inicio. Corregi el error anterior; si descargaste GitHub para relevar a un amigo, usa 8-RECIBIR-RELEVO.cmd.' }
    New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
    $nodePath = (Get-Command node.exe).Source
    $nodeArguments = @('--env-file-if-exists=.env', ('"' + $entryPath + '"'))
    $outputLog = Join-Path $dataPath 'runtime.log'
    $errorLog = Join-Path $dataPath 'runtime.err.log'
    $botProcess = Start-Process -FilePath $nodePath -ArgumentList $nodeArguments -WorkingDirectory $botRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
    $metadata = @{ pid = $botProcess.Id; startedAt = $botProcess.StartTime.ToUniversalTime().ToString('o'); entryPath = $entryPath }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 500
        if ($botProcess.HasExited) {
            $details = if (Test-Path -LiteralPath $errorLog) { Get-Content -LiteralPath $errorLog -Raw } else { '' }
            if ($details -match 'TokenInvalid|invalid token|401\b') { throw 'Discord rechazo el token. Revisa DISCORD_TOKEN en .env o pedi un relevo actualizado.' }
            if ($details -match 'disallowed intents|4014') { throw 'Activa SERVER MEMBERS INTENT y MESSAGE CONTENT INTENT en Discord Developer Portal, seccion Bot.' }
            if ($details -match 'ya est') { throw 'Hay otra copia de este bot ejecutandose en esta PC. No se inicio una segunda.' }
            throw 'El bot se cerro durante el arranque. Revisa data/runtime.err.log (no compartas tokens) y 9-DIAGNOSTICO.cmd.'
        }
        if ((Test-Path -LiteralPath $outputLog) -and ((Get-Content -LiteralPath $outputLog -Raw) -match 'conectado\.')) {
            $metadata | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding UTF8
            Write-Host 'Agente Canino CONECTADO a Discord y funcionando en segundo plano.'
            Write-Host 'Podes cerrar esta ventana. Para detenerlo: 6-DETENER.cmd. Para pasarlo a un amigo: 7-PREPARAR-RELEVO.cmd.'
            Write-Host 'No arranca solo al encender Windows. Abri 5-INICIAR.cmd cada vez que vayas a alojarlo.'
            exit 0
        }
    }
    $metadata | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding UTF8
    Write-Host 'El proceso sigue abierto, pero Discord todavia no confirmo la conexion. Revisa Internet y data/runtime.log.'
    Write-Host 'No inicies otra copia. Para cancelarlo usa 6-DETENER.cmd.'
    exit 2
} catch { Write-Host $_.Exception.Message; exit 1 }
