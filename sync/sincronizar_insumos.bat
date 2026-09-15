@echo off
cd /d "%~dp0.."
node scripts/sync/sync-insumos-moldagem.js
exit
