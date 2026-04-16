@echo off
cd /d "%~dp0"
node scripts/sync/sync-firebird-to-postgres.js
exit
