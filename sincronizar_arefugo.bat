@echo off
cd /d "%~dp0"
node scripts/sync-refugos-firebird-postgres.js
exit
