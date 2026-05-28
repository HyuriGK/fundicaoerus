@echo off
cd /d "%~dp0.."
echo Iniciando Sincronizacao de Fichas Tecnicas de Fusao (Firebird para Postgres)...
node scripts/sync/sync-page-lock.js lock fichatecfusao.html
node scripts\sync\sync-fichatecnica-fusao.js
node scripts/sync/sync-page-lock.js unlock fichatecfusao.html
echo.
echo Sincronizacao Concluida!
pause
