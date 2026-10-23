$ErrorActionPreference = 'Stop'
$botRoot = Split-Path -Parent $PSScriptRoot
$entryPath = Join-Path $botRoot 'src\index.js'
$dataPath = Join-Path $botRoot 'data'
$processFile = Join-Path $dataPath 'runtime-process.json'

function Get-ManagedBotProcess {
    if (-not (Test-Path -LiteralPath $processFile)) { return $null }
    try {
        $savedProcess = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
        $savedStartTime = if ($savedProcess.startedAt -is [DateTime]) { $savedProcess.startedAt.ToUniversalTime() } else { [DateTime]::Parse([string]$savedProcess.startedAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
        if (-not $savedProcess.pid -or -not $savedProcess.entryPath) { throw 'Invalid metadata' }
    } catch { throw 'El registro de inicio esta danado. No se detuvo ningun proceso. Revisa data/runtime-process.json.' }
    $existingProcess = Get-Process -Id $savedProcess.pid -ErrorAction SilentlyContinue
    if (-not $existingProcess) { return $null }
    if ($existingProcess.ProcessName -ne 'node' -or $savedProcess.entryPath -ne $entryPath -or [Math]::Abs(($existingProcess.StartTime.ToUniversalTime() - $savedStartTime).TotalSeconds) -ge 2) {
        Write-Host 'El registro es de una ejecucion anterior; no se toca el proceso que reutilizo ese PID.'
        return $null
    }
    return $existingProcess
}

function Stop-ManagedBotProcess {
    $existingProcess = Get-ManagedBotProcess
    if ($existingProcess) {
        $savedMetadata = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
        $stoppedGracefully = $false
        if ($savedMetadata.stopProtocol -eq 1) {
            @{pid=$existingProcess.Id;requestedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataPath 'stop-request.json') -Encoding UTF8
            $stoppedGracefully = $existingProcess.WaitForExit(15000)
        }
        if (-not $stoppedGracefully) {
            Stop-Process -Id $existingProcess.Id -Force -ErrorAction SilentlyContinue
            if (-not $existingProcess.WaitForExit(10000)) { throw 'El bot todavia no se detuvo. No se preparo ningun relevo.' }
        }
        Write-Host 'Agente Canino detenido en esta PC.'
    } else { Write-Host 'No hay un bot iniciado en segundo plano desde esta carpeta.' }
    if (Test-Path -LiteralPath $processFile) { Remove-Item -LiteralPath $processFile }
}
