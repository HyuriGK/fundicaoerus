@echo off
cd /d "%~dp0"
node scripts/sync/sync-master.js
exit
