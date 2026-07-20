@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-syncing.js start usinagem_externa.html
node scripts/sync/sync-valor-usinagem-firebird-postgres.js
node scripts/sync/sync-page-syncing.js end usinagem_externa.html
exit
