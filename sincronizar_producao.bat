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
node scripts/sync-page-lock.js lock apontamentos_produtivos.html

:: Executa o script Node.js
node scripts/sync-production-firebird-postgres.js

:: Desbloqueia a tela apos a sincronizacao
node scripts/sync-page-lock.js unlock apontamentos_produtivos.html

echo.
echo ===================================================
echo   PROCESSO FINALIZADO
echo ===================================================
echo.
exit
