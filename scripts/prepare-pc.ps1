param([switch]$OnlyRuntime, [switch]$Portable)
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    . (Join-Path $PSScriptRoot 'node-runtime.ps1')
    Set-Location -LiteralPath $runtimeBotRoot
    $nodePath = if (-not $Portable) { Use-BotNode } else { $null }
    if (-not $nodePath) {
        Write-Output 'Preparando Node.js portatil desde nodejs.org. No se modifica Windows ni se necesita Administrador.'
        $ProgressPreference = 'SilentlyContinue'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
        if (-not [Environment]::Is64BitOperatingSystem) { throw 'Esta version del bot necesita Windows de 64 bits.' }
        $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
        $release = $releases | Where-Object { $_.version -match '^v24\.(\d+)\.\d+$' -and [int]$Matches[1] -ge 17 -and $_.files -contains "win-$architecture-zip" } | Select-Object -First 1
        if (-not $release) { throw 'No se encontro una version compatible en nodejs.org.' }
        $version = [string]$release.version
        if ($version -notmatch '^v24\.\d+\.\d+$') { throw 'Respuesta invalida del servidor de descargas.' }
        $archiveName = "node-$version-win-$architecture.zip"
        $runtimeRoot = [IO.Path]::GetFullPath((Join-Path $runtimeBotRoot '.runtime'))
        $runtimeTarget = [IO.Path]::GetFullPath((Join-Path $runtimeRoot 'node'))
        $work = [IO.Path]::GetFullPath((Join-Path $runtimeRoot ('download-' + [Guid]::NewGuid().ToString('N'))))
        function Assert-RuntimePath([string]$path) {
            $absolute = [IO.Path]::GetFullPath($path)
            if (-not $absolute.StartsWith($runtimeRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Se rechazo una ruta fuera de .runtime.' }
        }
        Assert-RuntimePath $work
        Assert-RuntimePath $runtimeTarget
        New-Item -ItemType Directory -Path $work -Force | Out-Null
        try {
            $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$version/SHASUMS256.txt" -TimeoutSec 30).Content
            $checksumLine = @(([string]$checksums -split '\r?\n') | Where-Object { $_ -match ('^[a-fA-F0-9]{64}\s+' + [regex]::Escape($archiveName) + '$') })
            if ($checksumLine.Count -ne 1) { throw 'No se pudo verificar la descarga oficial de Node.js.' }
            $expected = ($checksumLine[0] -split '\s+')[0]
            $zip = Join-Path $work $archiveName
            Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$version/$archiveName" -OutFile $zip -TimeoutSec 300
            if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ine $expected) { throw 'La descarga esta incompleta o danada. No se ejecutara.' }
            Expand-Archive -LiteralPath $zip -DestinationPath $work
            $extracted = Join-Path $work "node-$version-win-$architecture"
            Assert-RuntimePath $extracted
            if (Test-Path -LiteralPath $runtimeTarget) { throw 'Ya existe .runtime/node pero no es compatible. Conservamos esa carpeta; revisala antes de volver a preparar esta PC.' }
            Move-Item -LiteralPath $extracted -Destination $runtimeTarget
        } finally {
            Assert-RuntimePath $work
            if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
        }
        $nodePath = Use-BotNode
        if (-not $nodePath) { throw 'No se pudo preparar Node.js en esta carpeta.' }
    }
    if (-not $OnlyRuntime) {
        if (-not (Test-Path -LiteralPath 'node_modules\discord.js\package.json') -or -not (Test-Path -LiteralPath 'node_modules\@napi-rs\canvas\package.json')) {
            Write-Output 'Instalando los componentes del bot. La primera vez necesita Internet.'
            $npmCli = Join-Path (Split-Path -Parent $nodePath) 'node_modules\npm\bin\npm-cli.js'
            if (-not (Test-Path -LiteralPath $npmCli)) { throw 'Esta instalacion de Node no incluye npm. Usa una instalacion completa o el runtime portatil.' }
            & $nodePath $npmCli ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar los componentes. Revisa Internet y volve a intentar.' }
        }
    }
    Write-Output 'Esta PC esta preparada.'
} catch { Write-Output $_.Exception.Message; exit 1 }
