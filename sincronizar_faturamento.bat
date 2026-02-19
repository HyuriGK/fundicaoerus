@echo off
title Sincronizador de Faturamento (Firebird -> Postgres)
color 0B

:: Muda para o diretorio onde o script esta
cd /d "%~dp0"

echo ===================================================
echo   INICIANDO SINCRONIZACAO DE FATURAMENTO
echo   Firebird: FATURAMENTO
echo   Postgres: faturamento_firebird
echo ===================================================
echo.

:: Bloqueia a tela durante a sincronizacao
echo [LOCK] Bloqueando tela faturamentos.html...
curl -s -X POST http://localhost:3000/api/page-locks/sync-lock -H "Content-Type: application/json" -d "{\"page_id\":\"faturamentos.html\"}" > nul 2>&1

:: Executa o script Node.js
node scripts/sync-firebird-to-postgres.js

:: Desbloqueia a tela apos a sincronizacao
echo [UNLOCK] Desbloqueando tela faturamentos.html...
curl -s -X POST http://localhost:3000/api/page-locks/sync-unlock -H "Content-Type: application/json" -d "{\"page_id\":\"faturamentos.html\"}" > nul 2>&1

echo.
echo ===================================================
echo   PROCESSO FINALIZADO
echo ===================================================
echo.
pause
