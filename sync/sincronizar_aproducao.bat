@echo off
cd /d "%~dp0"
node scripts/sync/sync-production-firebird-postgres.js
exit
