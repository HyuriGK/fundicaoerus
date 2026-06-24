@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-lock.js lock custos.html
node scripts/sync/sync-page-lock.js lock centrocusto.html
node scripts/sync/sync-centro-custos-firebird-postgres.js
node scripts/sync/sync-custos-firebird-postgres.js
node scripts/sync/sync-page-lock.js unlock custos.html
node scripts/sync/sync-page-lock.js unlock centrocusto.html
exit
