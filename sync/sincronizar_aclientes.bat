@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-lock.js lock clientes.html
node scripts/sync/sync-clientes-firebird-to-postgres.js
node scripts/sync/sync-page-lock.js unlock clientes.html
exit
