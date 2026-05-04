@echo off
cd /d %~dp0
start "SGP ERUS - Ficha Tecnica Moldagem" cmd /k "node scripts\sync\sync-forever-moldagem.js"
title SGP ERUS - Sincronizacao em Tempo Real
node scripts\sync\sync-forever.js
echo.
echo [ERRO] O processo de sincronizacao foi interrompido.
pause
