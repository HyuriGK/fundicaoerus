@echo off
cd /d "%~dp0"
node scripts/sync-custos-firebird-postgres.js
exit
