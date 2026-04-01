@echo off
cd /d "%~dp0"
node scripts/sync-production-firebird-postgres.js
exit
