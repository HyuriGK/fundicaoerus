@echo off
setlocal
cd /d %~dp0

echo ======================================================
echo   Sync de Pagamentos - Balanco Financeiro
echo ======================================================
echo.

echo [1/1] Sincronizando PAGAR_PAGAMENTO (Firebird -> Postgres)...
node scripts/sync-balanco-pagamentos.js

echo.
echo ======================================================
echo   SYNC CONCLUIDO: Pagamentos carregados no Neon.
echo   Abra o balanco.html para visualizar os dados!
echo ======================================================
echo.
pause
