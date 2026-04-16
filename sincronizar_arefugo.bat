@echo off
cd /d "%~dp0"
node scripts/sync/sync-refugos-firebird-postgres.js
exit
