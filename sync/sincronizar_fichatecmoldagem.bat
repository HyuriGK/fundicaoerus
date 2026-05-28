@echo off
cd /d "%~dp0.."
echo Iniciando Sincronizacao de Fichas Tecnicas (Firebird para Postgres)...
node scripts/sync/sync-page-lock.js lock fichatecmoldagem.html
node scripts\reset-sync-fichatecnica.js
node scripts/sync/sync-page-lock.js unlock fichatecmoldagem.html
echo.
echo Sincronizacao Concluida!
exit
