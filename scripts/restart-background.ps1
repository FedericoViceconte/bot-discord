$ErrorActionPreference = 'Stop'
$botRoot = Split-Path -Parent $PSScriptRoot
$entryPath = Join-Path $botRoot 'src\index.js'
$processFile = Join-Path $botRoot 'data\runtime-process.json'
if (Test-Path -LiteralPath $processFile) {
    $savedProcess = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
    $savedStartTime = if ($savedProcess.startedAt -is [DateTime]) { $savedProcess.startedAt.ToUniversalTime() } else { [DateTime]::Parse([string]$savedProcess.startedAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
    $existingProcess = Get-Process -Id $savedProcess.pid -ErrorAction SilentlyContinue
    if ($existingProcess) {
        if ($existingProcess.ProcessName -ne 'node' -or $savedProcess.entryPath -ne $entryPath -or [Math]::Abs(($existingProcess.StartTime.ToUniversalTime() - $savedStartTime).TotalSeconds) -ge 2) {
            throw 'El PID guardado no coincide con el proceso de este bot. No se detuvo ningún proceso.'
        }
        Stop-Process -Id $existingProcess.Id -Force
        $existingProcess.WaitForExit(5000) | Out-Null
        Write-Output 'Instancia anterior de Agente Canino detenida.'
    }
}
& (Join-Path $PSScriptRoot 'start-background.ps1')
