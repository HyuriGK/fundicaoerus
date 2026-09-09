@echo off
cd /d "%~dp0.."
node scripts\sync\sync-page-syncing.js start produtos.html
node scripts\sync\sync-produtos-firebird-postgres.js
node scripts\sync\sync-page-syncing.js end produtos.html
exit /b %errorlevel%
