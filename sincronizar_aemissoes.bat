@echo off
cd /d "%~dp0"
node scripts/sync/sync-emissoes.js
exit
