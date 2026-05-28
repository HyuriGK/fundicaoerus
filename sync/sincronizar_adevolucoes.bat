@echo off
cd /d "%~dp0.."
node scripts/sync/sync-page-lock.js lock devolucoes.html
node scripts/sync/sync-devolucoes.js
node scripts/sync/sync-page-lock.js unlock devolucoes.html
exit
