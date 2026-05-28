@echo off
title SGP ERUS - Sincronizar Emissoes (Manual)
color 0B
cls
cd /d "%~dp0.."
echo ======================================================
echo          SINCRONIZAR EMISSOES - MANUAL
echo ======================================================
echo.
echo Este script sincroniza apenas os dados de emissao
echo (graficos historicos e pendentes) do Pedidos.html.
echo.
node scripts/sync/sync-page-lock.js lock pedidos.html
node scripts/sync/sync-emissoes.js
node scripts/sync/sync-page-lock.js unlock pedidos.html
echo.
echo ======================================================
echo Sincronizacao finalizada.
pause
