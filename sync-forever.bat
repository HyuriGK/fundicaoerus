@echo off
title SGP ERUS - Sincronização em Tempo Real (Não Feche)
color 0E
cls
echo ======================================================
echo          SGP ERUS - SINCRONIZACAO FOREVER
echo ======================================================
echo.
echo Iniciando sincronização paralela de:
echo - Faturamento
echo - Produção / Monitoramento
echo - Refugos
echo - Custos
echo - Devoluções
echo.
echo [ATENÇÃO] Este terminal deve permanecer aberto para
echo manter os dados atualizados em tempo real.
echo.
echo ======================================================
echo.

node scripts/sync/sync-forever.js

echo.
echo [ERRO] O processo de sincronização foi interrompido.
pause
