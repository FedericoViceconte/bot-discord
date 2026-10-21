$ErrorActionPreference = 'Stop'
$botRoot = Split-Path -Parent $PSScriptRoot
$entryPath = Join-Path $botRoot 'src\index.js'
$dataPath = Join-Path $botRoot 'data'
$processFile = Join-Path $dataPath 'runtime-process.json'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
if (Test-Path -LiteralPath $processFile) {
    $savedProcess = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
    $savedStartTime = if ($savedProcess.startedAt -is [DateTime]) { $savedProcess.startedAt.ToUniversalTime() } else { [DateTime]::Parse([string]$savedProcess.startedAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
    $existingProcess = Get-Process -Id $savedProcess.pid -ErrorAction SilentlyContinue
    if ($existingProcess -and $existingProcess.ProcessName -eq 'node' -and $savedProcess.entryPath -eq $entryPath -and [Math]::Abs(($existingProcess.StartTime.ToUniversalTime() - $savedStartTime).TotalSeconds) -lt 2) {
        Write-Output "Agente Canino ya se está ejecutando. PID $($existingProcess.Id)"
        exit 0
    }
}
$nodePath = (Get-Command node.exe).Source
$nodeArguments = @('--env-file-if-exists=.env', ('"' + $entryPath + '"'))
$botProcess = Start-Process -FilePath $nodePath -ArgumentList $nodeArguments -WorkingDirectory $botRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'runtime.log') -RedirectStandardError (Join-Path $dataPath 'runtime.err.log') -PassThru
$metadata = @{ pid = $botProcess.Id; startedAt = $botProcess.StartTime.ToUniversalTime().ToString('o'); entryPath = $entryPath }
$metadata | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding UTF8
Write-Output "Agente Canino iniciado en segundo plano. PID $($botProcess.Id)"
