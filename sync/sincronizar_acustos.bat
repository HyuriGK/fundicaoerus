@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-syncing.js start custos.html
node scripts/sync/sync-page-syncing.js start centrocusto.html
node scripts/sync/sync-centro-custos-firebird-postgres.js
node scripts/sync/sync-custos-firebird-postgres.js
node scripts/sync/sync-page-syncing.js end custos.html
node scripts/sync/sync-page-syncing.js end centrocusto.html
exit
