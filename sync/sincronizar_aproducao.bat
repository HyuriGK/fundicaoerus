@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-lock.js lock apontamentos_produtivos.html
node scripts/sync/sync-production-firebird-postgres.js
node scripts/sync/sync-page-lock.js unlock apontamentos_produtivos.html
exit
