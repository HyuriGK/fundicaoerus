@echo off
echo Sincronizando roteiros de producao (Firebird -> Postgres)...
node scripts/sync-roteiros.js
pause
