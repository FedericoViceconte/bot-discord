param([ValidateSet('export','import')][string]$Mode)
try {
    . (Join-Path $PSScriptRoot 'bot-process.ps1')
    Set-Location -LiteralPath $botRoot
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Instala Node.js 24.17 o superior y abri 1-INSTALAR.cmd.' }
    & node.exe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>24||(a===24&&b>=17)?0:1)"
    if ($LASTEXITCODE -ne 0) { throw 'Actualiza Node.js a 24.17 o superior antes de recibir o preparar el relevo.' }
    $handoffFile = $null
    if ($Mode -eq 'export') {
        Write-Host 'Esto DETIENE el bot y crea un archivo cifrado con sus credenciales y datos actuales.'
        Write-Host 'No lo publiques en GitHub ni en canales publicos. La otra PC debe seguir apagada hasta recibirlo.'
        if ((Read-Host 'Escribi RELEVO para continuar') -cne 'RELEVO') { throw 'Operacion cancelada.' }
    } else {
        if (Get-ManagedBotProcess) { throw 'El bot de esta carpeta esta abierto. Usa 6-DETENER.cmd antes de recibir un relevo.' }
        Write-Host 'Recibi siempre el archivo MAS RECIENTE. Esta copia reemplaza los datos locales (se guarda un respaldo).'
        Write-Host 'Primero coordina con el otro anfitrion: su bot debe estar detenido.'
        if ((Read-Host 'Escribi RECIBIR para continuar') -cne 'RECIBIR') { throw 'Operacion cancelada.' }
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Filter = 'Relevo WO (*.wohost)|*.wohost'
        $dialog.Title = 'Elegir el ultimo relevo recibido del anfitrion anterior'
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'Operacion cancelada.' }
        $handoffFile = $dialog.FileName
        $dialog.Dispose()
    }
    $securePassword = Read-Host 'Contrasena del relevo (minimo 12 caracteres; no se muestra)' -AsSecureString
    $password = (New-Object System.Net.NetworkCredential('', $securePassword)).Password
    if ($password.Length -lt 12 -or $password.Length -gt 1024) { throw 'La contrasena debe tener entre 12 y 1024 caracteres.' }
    if ($Mode -eq 'export') {
        $repeat = Read-Host 'Repeti la contrasena' -AsSecureString
        if ((New-Object System.Net.NetworkCredential('', $repeat)).Password -cne $password) { throw 'Las contrasenas no coinciden. No se detuvo el bot.' }
        & node.exe --env-file-if-exists=.env scripts/doctor.js
        if ($LASTEXITCODE -ne 0) { throw 'Corregi los errores antes de preparar el relevo.' }
        Stop-ManagedBotProcess
    }
    $inputJson = @{ password = $password; file = $handoffFile } | ConvertTo-Json -Compress
    # Send the password over stdin, never via command-line arguments or environment.
    $encodingBefore = $OutputEncoding
    try {
        $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
        $inputJson | & node.exe scripts/handoff.js $Mode
        $handoffExit = $LASTEXITCODE
    } finally { $OutputEncoding = $encodingBefore; $password = $null; $inputJson = $null }
    if ($handoffExit -ne 0) { throw 'El relevo no se completo. No inicies dos copias. Revisa el mensaje anterior.' }
} catch { Write-Host $_.Exception.Message; exit 1 }
