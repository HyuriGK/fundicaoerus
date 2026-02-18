@echo off
cd /d "%~dp0"
echo Sincronizando Refugo (Firebird -> Postgres)...
node scripts/sync-refugos-firebird-postgres.js
pause
