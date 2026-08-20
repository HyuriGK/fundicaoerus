@echo off
cd /d "%~dp0.."
node scripts/sync/sync-sac-firebird-postgres.js
if errorlevel 1 exit /b %errorlevel%
node scripts/sync/sync-sac-anexos-postgres.js
exit /b %errorlevel%
