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

:: Executa o script Node.js
:: Certifique-se de que o Node.js esta instalado e no PATH
node scripts/sync-production-firebird-postgres.js

echo.
echo ===================================================
echo   PROCESSO FINALIZADO
echo ===================================================
echo.
pause
