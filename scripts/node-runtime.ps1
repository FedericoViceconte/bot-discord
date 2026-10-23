$ErrorActionPreference = 'Stop'
$runtimeBotRoot = Split-Path -Parent $PSScriptRoot

function Use-BotNode {
    $candidates = @( (Join-Path $runtimeBotRoot '.runtime\node\node.exe') )
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if ($base) { $candidates += Join-Path $base 'nodejs\node.exe' }
    }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $version = & $candidate -p 'process.versions.node' 2>$null
        if ($LASTEXITCODE -eq 0 -and $version -match '^(\d+)\.(\d+)\.') {
            if ([int]$Matches[1] -gt 24 -or ([int]$Matches[1] -eq 24 -and [int]$Matches[2] -ge 17)) {
                $env:PATH = (Split-Path -Parent $candidate) + ';' + $env:PATH
                return $candidate
            }
        }
    }
    return $null
}
