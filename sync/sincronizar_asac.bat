@echo off
cd /d "%~dp0.."
node scripts/sync/sync-sac-firebird-postgres.js
exit /b %errorlevel%
