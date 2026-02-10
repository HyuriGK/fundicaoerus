@echo off
chcp 65001 > nul
cls
echo ╔════════════════════════════════════════════════════════════╗
echo ║         SINCRONIZAÇÃO DE PEDIDOS (CARTEIRA)               ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo 🚀 Iniciando sincronização...
echo.

node scripts/sync-data.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Erro ao sincronizar pedidos.
    pause
    exit /b 1
)

echo.
echo ✅ Sincronização concluída com sucesso!
echo.
pause
