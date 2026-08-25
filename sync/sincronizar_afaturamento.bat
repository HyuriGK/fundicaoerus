@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-lock.js lock faturamentos.html
node scripts/sync/sync-firebird-to-postgres.js
node scripts/sync/refresh-dashboard-snapshot.js
node scripts/sync/sync-page-lock.js unlock faturamentos.html
exit
