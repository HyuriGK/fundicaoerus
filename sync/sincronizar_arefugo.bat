@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-lock.js lock refugos.html
node scripts/sync/sync-refugos-firebird-postgres.js
node scripts/sync/refresh-refugo-kpi-snapshot.js
node scripts/sync/sync-page-lock.js unlock refugos.html
exit
