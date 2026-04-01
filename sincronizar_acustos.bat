@echo off
echo Sincronizando Custos (Firebird -^> Postgres)
cd %~dp0
node scripts\sync-custos-firebird-postgres.js
echo.
echo Sincronizacao de Custos Concluida!
exit
