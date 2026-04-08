@echo off
cd /d "%~dp0"
node scripts/sync-data.js
node scripts/sync-emissoes.js
exit
