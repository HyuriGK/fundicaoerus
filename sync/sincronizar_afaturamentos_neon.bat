@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-lock.js lock faturamentos.html
node scripts/sync/sync-faturamento-to-neon.js
node scripts/sync/sync-page-lock.js unlock faturamentos.html
pause
