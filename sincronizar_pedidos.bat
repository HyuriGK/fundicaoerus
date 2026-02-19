@echo off
chcp 65001 > nul
cls
echo ╔════════════════════════════════════════════════════════════╗
echo ║         SINCRONIZAÇÃO DE PEDIDOS (CARTEIRA)               ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Muda para o diretorio onde o script esta
cd /d "%~dp0"

:: Bloqueia a tela durante a sincronizacao
echo [LOCK] Bloqueando tela pedidos.html...
curl -s -X POST http://localhost:3000/api/page-locks/sync-lock -H "Content-Type: application/json" -d "{\"page_id\":\"pedidos.html\"}" > nul 2>&1

echo 🚀 Iniciando sincronização...
echo.

node scripts/sync-data.js

:: Desbloqueia a tela apos a sincronizacao
echo [UNLOCK] Desbloqueando tela pedidos.html...
curl -s -X POST http://localhost:3000/api/page-locks/sync-unlock -H "Content-Type: application/json" -d "{\"page_id\":\"pedidos.html\"}" > nul 2>&1

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
