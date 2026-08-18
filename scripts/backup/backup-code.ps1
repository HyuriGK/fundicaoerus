$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$BackupRoot = Join-Path (Split-Path $RootDir -Parent) "backup-sgp"
$BackupDir = Join-Path $BackupRoot (Get-Date -Format "dd-MM-yyyy")
$LogDir = Join-Path $BackupRoot "logs"
$RetentionDays = 30

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$LogFile = Join-Path $LogDir "backup-sgp.log"
$DestDir = Join-Path $BackupDir "fundicaoerus"

function Write-BackupLog($Message) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$stamp] $Message"
}

try {
    Write-BackupLog "Iniciando backup da pasta SGP: $RootDir -> $DestDir"

    & robocopy $RootDir $DestDir /MIR /R:2 /W:5 /XD backups /XF *.dump
    $code = $LASTEXITCODE
    if ($code -gt 7) {
        throw "robocopy finalizou com codigo $code"
    }

    Get-ChildItem $BackupRoot -Directory |
        Where-Object { $_.Name -match '^\d{2}-\d{2}-\d{4}$' -and $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
        Remove-Item -Recurse -Force

    Write-BackupLog "Backup da pasta SGP concluido: $DestDir"
    Write-Output $DestDir
    exit 0
} catch {
    Write-BackupLog "ERRO: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
