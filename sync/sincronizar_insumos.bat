@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-lock.js lock insumosmoldagem.html
node scripts/sync/sync-insumos-moldagem.js
node scripts/sync/sync-page-lock.js unlock insumosmoldagem.html
exit
