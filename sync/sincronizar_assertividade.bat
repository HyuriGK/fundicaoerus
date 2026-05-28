@echo off
chcp 65001 > nul
cls
cd /d "%~dp0.."

echo ╔════════════════════════════════════════════════════════════╗
echo ║         SINCRONIZAÇÃO DE ASSERTIVIDADE (2025/2026)        ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

node scripts/sync/sync-page-lock.js lock comparativo.html

echo Iniciando sincronizacao...
echo.

node scripts/sync/sync-assertividade.js

node scripts/sync/sync-page-lock.js unlock comparativo.html

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Erro ao sincronizar assertividade.
    pause
    exit /b 1
)

echo.
echo Sincronizacao concluida com sucesso!
echo.
exit
