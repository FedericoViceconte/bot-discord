param([ValidateSet('start','stop','doctor','export','import')][string]$Action)
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    . (Join-Path $PSScriptRoot 'bot-process.ps1')
    . (Join-Path $PSScriptRoot 'node-runtime.ps1')
    Set-Location -LiteralPath $botRoot
    if ($Action -eq 'stop') { Stop-ManagedBotProcess; exit 0 }
    if (-not (Use-BotNode)) { throw 'Esta PC todavia no esta preparada. Usa el boton Preparar esta PC.' }
    if ($Action -eq 'start') { & (Join-Path $PSScriptRoot 'start-background.ps1'); exit $LASTEXITCODE }
    if ($Action -eq 'doctor') { & node.exe --env-file-if-exists=.env scripts/doctor.js; exit $LASTEXITCODE }
    if ($Action -eq 'import' -and (Get-ManagedBotProcess)) { throw 'Detene el bot de esta PC antes de recibir un relevo.' }
    if ($Action -eq 'export') {
        & node.exe --env-file-if-exists=.env scripts/doctor.js
        if ($LASTEXITCODE -ne 0) { throw 'La configuracion local no esta lista para preparar un relevo.' }
        Stop-ManagedBotProcess
    }
    # The GUI sends the password as UTF-8 JSON over stdin, never in arguments.
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = $utf8
    $payload = [Console]::In.ReadToEnd()
    $encodingBefore = $OutputEncoding
    try { $OutputEncoding = $utf8; $payload | & node.exe scripts/handoff.js $Action; $handoffExit = $LASTEXITCODE }
    finally { $OutputEncoding = $encodingBefore; $payload = $null }
    exit $handoffExit
} catch { Write-Output $_.Exception.Message; exit 1 }
