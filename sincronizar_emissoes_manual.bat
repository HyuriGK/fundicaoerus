@echo off
title SGP ERUS - Sincronizar Emissões (Manual)
color 0B
cls
echo ======================================================
echo          SINCRONIZAR EMISSOES - MANUAL
echo ======================================================
echo.
echo Este script sincroniza apenas os dados de emissao 
echo (graficos historicos e pendentes) do Pedidos.html.
echo.
node scripts/sync-emissoes.js
echo.
echo ======================================================
echo Sincronizacao finalizada.
pause
