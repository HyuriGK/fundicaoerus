@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-lock.js lock pedidos.html
node scripts/sync/sync-production-firebird-postgres.js
node scripts/sync/sync-page-lock.js unlock pedidos.html
exit
