@echo off
chcp 65001 > nul
cls

:: Muda para o diretorio onde o script esta
cd /d "%~dp0"

echo ╔════════════════════════════════════════════════════════════╗
echo ║         SINCRONIZAÇÃO DE ASSERTIVIDADE (2025/2026)        ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Bloqueia a tela durante a sincronizacao
node scripts/sync-page-lock.js lock comparativo.html

echo 🚀 Iniciando sincronização...
echo.

node scripts/sync-assertividade.js

:: Desbloqueia a tela apos a sincronizacao
node scripts/sync-page-lock.js unlock comparativo.html

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Erro ao sincronizar assertividade.
    pause
    exit /b 1
)

echo.
echo ✅ Sincronização concluída com sucesso!
echo.
pause
