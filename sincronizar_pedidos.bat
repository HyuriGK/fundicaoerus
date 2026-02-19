@echo off
chcp 65001 > nul
cls

:: Muda para o diretorio onde o script esta
cd /d "%~dp0"

echo ╔════════════════════════════════════════════════════════════╗
echo ║         SINCRONIZAÇÃO DE PEDIDOS (CARTEIRA)               ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Bloqueia a tela durante a sincronizacao
node scripts/sync-page-lock.js lock pedidos.html

echo 🚀 Iniciando sincronização...
echo.

node scripts/sync-data.js

:: Desbloqueia a tela apos a sincronizacao
node scripts/sync-page-lock.js unlock pedidos.html

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
