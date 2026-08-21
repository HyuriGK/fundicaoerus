@echo off
cd /d "%~dp0.."
node scripts\sync\sync-notas-servico-firebird-postgres.js
