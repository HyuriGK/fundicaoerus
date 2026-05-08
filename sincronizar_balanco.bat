@echo off
setlocal
cd /d %~dp0

echo ======================================================
echo   Sync Balanco Financeiro - Pagamentos e Recebimentos
echo ======================================================
echo.

echo [1/3] Sincronizando PAGAR_PAGAMENTO (Firebird -> Postgres)...
node scripts/sync-balanco-pagamentos.js

echo.
echo [2/3] Sincronizando RECEBER_PAGAMENTO (Firebird -> Postgres)...
node scripts/sync-balanco-recebimentos.js

echo.
echo [3/3] Sincronizando DESPESA (Firebird -> Postgres)...
node scripts/sync-balanco-despesas.js

echo.
echo ======================================================
echo   SYNC CONCLUIDO: Dados carregados no Neon.
echo   Abra o balanco.html para visualizar!
echo ======================================================
echo.
pause
