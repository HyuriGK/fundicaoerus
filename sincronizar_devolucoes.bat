@echo off
setlocal enabledelayedexpansion

:: ============================================================================
:: Scripts de Sincronização SGP - DEVOLUÇÕES
:: ============================================================================

set LOCK_FILE=%temp%\sgp_sync_devolucoes.lock

:: Verificar se já existe uma instância rodando
if exist "%LOCK_FILE%" (
    set /p PID_RUNNING=<"%LOCK_FILE%"
    tasklist /FI "PID eq !PID_RUNNING!" | find "!PID_RUNNING!" > nul
    if !errorlevel! equ 0 (
        echo [ERROR] Sincronizacao de devolucoes ja esta em execucao (PID !PID_RUNNING!).
        exit /b 1
    )
)

:: Salvar o PID atual
echo %RANDOM% > "%LOCK_FILE%"

echo [INFO] Iniciando sincronizacao de Devolucoes (Firebird -^> Postgres)...
echo [INFO] Horario: %DATE% %TIME%

:: Rodar o script Node.js
node scripts/sync-devolucoes.js

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Sincronizacao concluida com sucesso!
) else (
    echo.
    echo [ERROR] Falha na sincronizacao. Verifique os logs acima.
)

:: Remover arquivo de lock
del "%LOCK_FILE%" > nul 2^>^&1

pause
