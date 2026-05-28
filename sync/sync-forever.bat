@echo off
cd /d "%~dp0.."
title SGP ERUS - Sincronizacao em Tempo Real
node scripts\sync\sync-forever.js
echo.
echo [ERRO] O processo de sincronizacao foi interrompido.
pause
