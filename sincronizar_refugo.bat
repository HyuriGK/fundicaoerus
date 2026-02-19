@echo off
cd /d "%~dp0"

:: Bloqueia a tela durante a sincronizacao
echo [LOCK] Bloqueando tela refugos.html...
curl -s -X POST http://localhost:3000/api/page-locks/sync-lock -H "Content-Type: application/json" -d "{\"page_id\":\"refugos.html\"}" > nul 2>&1

echo Sincronizando Refugo (Firebird -> Postgres)...
node scripts/sync-refugos-firebird-postgres.js

:: Desbloqueia a tela apos a sincronizacao
echo [UNLOCK] Desbloqueando tela refugos.html...
curl -s -X POST http://localhost:3000/api/page-locks/sync-unlock -H "Content-Type: application/json" -d "{\"page_id\":\"refugos.html\"}" > nul 2>&1

pause
