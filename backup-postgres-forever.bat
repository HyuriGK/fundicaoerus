@echo off
cd /d "%~dp0"
title SGP ERUS - Backup Postgres Forever

set BACKUP_TIME=19:00
set LAST_RUN_FILE=backups\logs\backup-postgres-last-run.txt

if not exist backups\logs mkdir backups\logs

echo [INFO] Backup Postgres automatico iniciado.
echo [INFO] Horario diario: %BACKUP_TIME%
echo.

:loop
for /f %%D in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%D
for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format HH:mm"') do set NOW=%%T

set LAST_RUN=
if exist "%LAST_RUN_FILE%" set /p LAST_RUN=<"%LAST_RUN_FILE%"

if "%NOW%" GEQ "%BACKUP_TIME%" (
    if not "%LAST_RUN%"=="%TODAY%" (
        echo [%DATE% %TIME%] Iniciando backup Postgres...
        powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\backup\backup-postgres.ps1"
        if errorlevel 1 (
            echo [%DATE% %TIME%] ERRO no backup. Verifique backups\logs\backup-postgres.log
        ) else (
            echo %TODAY%>"%LAST_RUN_FILE%"
            echo [%DATE% %TIME%] Backup concluido.
        )
        echo.
    )
)

timeout /t 60 /nobreak >nul
goto loop
