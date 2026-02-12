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

:: Executa o script Node.js
node scripts/sync-firebird-to-postgres.js

echo.
echo ===================================================
echo   PROCESSO FINALIZADO
echo ===================================================
echo.
pause
