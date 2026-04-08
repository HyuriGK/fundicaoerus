@echo off
cd /d "%~dp0"
node scripts/sync-master.js
node scripts/sync-emissoes.js
exit
