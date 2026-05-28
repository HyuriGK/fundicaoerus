@echo off
cd /d "%~dp0"
node scripts/sync/sync-custos-firebird-postgres.js
exit
