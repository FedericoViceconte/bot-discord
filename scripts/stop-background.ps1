try {
    . (Join-Path $PSScriptRoot 'bot-process.ps1')
    Stop-ManagedBotProcess
    Write-Host 'Si lo abriste en una consola con npm start, cerralo con Ctrl+C en esa consola.'
} catch { Write-Host $_.Exception.Message; exit 1 }
