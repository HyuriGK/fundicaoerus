@echo off
title Sincronizador de Producao (Firebird -> Postgres)
color 0E

:: Muda para o diretorio onde o script esta
cd /d "%~dp0"

echo ===================================================
echo   INICIANDO SINCRONIZACAO DE PRODUCAO (2026)
echo   Firebird: PRODUCAO_SETOR
echo   Postgres: producao_apontada_sincronizada
echo ===================================================
echo.

:: Bloqueia a tela durante a sincronizacao
echo [LOCK] Bloqueando tela apontamentos_produtivos.html...
curl -s -X POST http://localhost:3000/api/page-locks/sync-lock -H "Content-Type: application/json" -d "{\"page_id\":\"apontamentos_produtivos.html\"}" > nul 2>&1

:: Executa o script Node.js
:: Certifique-se de que o Node.js esta instalado e no PATH
node scripts/sync-production-firebird-postgres.js

:: Desbloqueia a tela apos a sincronizacao
echo [UNLOCK] Desbloqueando tela apontamentos_produtivos.html...
curl -s -X POST http://localhost:3000/api/page-locks/sync-unlock -H "Content-Type: application/json" -d "{\"page_id\":\"apontamentos_produtivos.html\"}" > nul 2>&1

echo.
echo ===================================================
echo   PROCESSO FINALIZADO
echo ===================================================
echo.
pause
