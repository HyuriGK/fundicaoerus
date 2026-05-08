@echo off
setlocal
cd /d %~dp0

echo ======================================================
echo   Sync Balanco Financeiro - Pagamentos e Recebimentos
echo ======================================================
echo.

echo [1/2] Sincronizando PAGAR_PAGAMENTO (Firebird -> Postgres)...
node scripts/sync-balanco-pagamentos.js

echo.
echo [2/2] Sincronizando RECEBER_PAGAMENTO (Firebird -> Postgres)...
node scripts/sync-balanco-recebimentos.js

echo.
echo ======================================================
echo   SYNC CONCLUIDO: Dados carregados no Neon.
echo   Abra o balanco.html para visualizar!
echo ======================================================
echo.
pause
