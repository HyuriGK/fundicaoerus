@echo off
cd /d %~dp0
title SGP ERUS - Sync Moldagem
node scripts\sync\sync-forever-moldagem.js
pause
