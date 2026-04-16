@echo off
setlocal
cd /d %~dp0

echo ======================================================
echo   Sincronizador de Producao (Focado em Roteiros)
echo ======================================================
echo.

echo [1/1] Sincronizando Roteiros das OPs em aberto...
node scripts/sync/sync-master.js

echo.
echo ======================================================
echo   SINCRO PARADA: Roteiros carregados para o Postgres.
echo   Seus dados estao prontos no dashboard!
echo ======================================================
echo.
exit
