try {
    . (Join-Path $PSScriptRoot 'bot-process.ps1')
    Stop-ManagedBotProcess
    & (Join-Path $PSScriptRoot 'start-background.ps1')
    exit $LASTEXITCODE
} catch { Write-Host $_.Exception.Message; exit 1 }
