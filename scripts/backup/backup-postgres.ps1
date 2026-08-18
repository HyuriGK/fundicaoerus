$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$BackupRoot = Join-Path (Split-Path $RootDir -Parent) "backup-neon"
$BackupDir = Join-Path $BackupRoot (Get-Date -Format "dd-MM-yyyy")
$LogDir = Join-Path $BackupRoot "logs"
$PgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$RetentionDays = 30

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$LogFile = Join-Path $LogDir "backup-postgres.log"

function Write-BackupLog($Message) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$stamp] $Message"
}

try {
    if (!(Test-Path $PgDump)) {
        throw "pg_dump nao encontrado em $PgDump"
    }

    $EnvPath = Join-Path $RootDir ".env.local"
    if (!(Test-Path $EnvPath)) {
        throw ".env.local nao encontrado"
    }

    $line = Select-String -Path $EnvPath -Pattern "^DATABASE_URL=" | Select-Object -First 1
    if (!$line) {
        throw "DATABASE_URL nao encontrado no .env.local"
    }

    $raw = $line.Line.Substring("DATABASE_URL=".Length).Trim().Trim('"')
    if ($raw -match "postgresql://[^']+") {
        $dbUrl = $Matches[0]
    } else {
        $dbUrl = $raw
    }

    $stamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
    $out = Join-Path $BackupDir "backup-postgres-$stamp.dump"

    Write-BackupLog "Iniciando backup: $out"
    & $PgDump --no-owner --no-privileges $dbUrl -F c -f $out
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump finalizou com codigo $LASTEXITCODE"
    }

    $file = Get-Item $out
    if ($file.Length -le 0) {
        throw "backup gerado com tamanho zero"
    }

    Get-ChildItem $BackupRoot -Directory |
        Where-Object { $_.Name -match '^\d{2}-\d{2}-\d{4}$' -and $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
        Remove-Item -Recurse -Force

    Get-ChildItem $BackupDir -Filter "backup-postgres-*.dump" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
        Remove-Item -Force

    Write-BackupLog "Backup concluido: $($file.FullName) ($($file.Length) bytes)"
    Write-Output $file.FullName
} catch {
    Write-BackupLog "ERRO: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
