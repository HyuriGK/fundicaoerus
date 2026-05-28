@echo off
cd /d %~dp0
echo Iniciando Sincronizacao de Fichas Tecnicas de Fusao (Firebird para Postgres)...
node scripts\sync\sync-fichatecnica-fusao.js
echo.
echo Sincronizacao Concluida!
pause
