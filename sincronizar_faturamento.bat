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
node scripts/sync-page-lock.js lock faturamentos.html

:: Executa o script Node.js
node scripts/sync-firebird-to-postgres.js

:: Desbloqueia a tela apos a sincronizacao
node scripts/sync-page-lock.js unlock faturamentos.html

echo.
echo ===================================================
echo   PROCESSO FINALIZADO
echo ===================================================
echo.
pause
