@echo off
setlocal
cd /d %~dp0

echo ======================================================
echo   Sincronizador de Dados de Producao (Firebird -> Postgres)
echo ======================================================
echo.

echo [1/2] Sincronizando Fichas Tecnicas...
node scripts/sync-fichatecnica.js

echo.
echo [2/2] Sincronizando Roteiros de Producao e OPs...
node scripts/sync-roteiros.js

echo.
echo ======================================================
echo   Sincronizacao concluida com sucesso!
echo ======================================================
echo.
pause
