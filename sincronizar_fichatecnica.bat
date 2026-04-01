@echo off
cd /d %~dp0
echo Iniciando Sincronizacao de Fichas Tecnicas (Firebird para Postgres)...
node scripts\reset-sync-fichatecnica.js
echo.
echo Sincronizacao Concluida!
exit
