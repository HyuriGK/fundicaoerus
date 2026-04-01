@echo off
cd /d "%~dp0"

:: Bloqueia a tela durante a sincronizacao
node scripts/sync-page-lock.js lock refugos.html

echo Sincronizando Refugo (Firebird -> Postgres)...
node scripts/sync-refugos-firebird-postgres.js

:: Desbloqueia a tela apos a sincronizacao
node scripts/sync-page-lock.js unlock refugos.html

exit
