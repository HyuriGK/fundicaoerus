@echo off
setlocal

:: ============================================================================
:: Scripts de Sincronização SGP - DEVOLUÇÕES
:: ============================================================================

:: Garantir que o comando rode na pasta do script
cd /d "%~dp0"

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

pause
