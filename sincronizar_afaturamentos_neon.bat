@echo off
cd /d "%~dp0"
node scripts/sync/sync-faturamento-to-neon.js
pause
