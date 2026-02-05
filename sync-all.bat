@echo off
chcp 65001 > nul
cls
echo ╔════════════════════════════════════════════════════════════╗
echo ║     SINCRONIZAÇÃO COMPLETA - FIREBIRD → NEON              ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo 🚀 Iniciando sincronização de dados...
echo.

REM ===== SETUP INICIAL (primeira vez) =====
echo ┌─────────────────────────────────────────────────────────┐
echo │ [SETUP] Verificando estrutura do banco...              │
echo └─────────────────────────────────────────────────────────┘
echo.

echo   → Criando tabela de clientes ocultos...
node scripts/create-filtros-table.js
if %ERRORLEVEL% NEQ 0 (
    echo   ❌ Erro ao criar tabela de filtros
    pause
    exit /b 1
)
echo.

echo   → Adicionando coluna cliente_nome...
node scripts/add-cliente-nome-column.js
if %ERRORLEVEL% NEQ 0 (
    echo   ⚠️  Coluna já existe ou erro (pode ignorar)
)
echo.

REM ===== SINCRONIZAÇÃO DE DADOS =====
echo ┌─────────────────────────────────────────────────────────┐
echo │ [1/2] Sincronizando PEDIDOS (2025-2026)...             │
echo └─────────────────────────────────────────────────────────┘
echo.
node scripts/sync-data.js
if %ERRORLEVEL% NEQ 0 (
    echo   ❌ Erro ao sincronizar pedidos
    pause
    exit /b 1
)
echo.
echo   ✅ Pedidos sincronizados com sucesso!
echo.

echo ┌─────────────────────────────────────────────────────────┐
echo │ [2/2] Sincronizando FATURAMENTO (2026)...              │
echo └─────────────────────────────────────────────────────────┘
echo.
node scripts/sync-firebird-to-postgres.js
if %ERRORLEVEL% NEQ 0 (
    echo   ❌ Erro ao sincronizar faturamento
    pause
    exit /b 1
)
echo.
echo   ✅ Faturamento sincronizado com sucesso!
echo.

REM ===== CONCLUSÃO =====
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                 ✅ SINCRONIZAÇÃO CONCLUÍDA!                ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo 📊 Dados sincronizados:
echo    • Pedidos (2025-2026) → firebird_sync_pedidos
echo    • Faturamento (2026)  → faturamento_firebird
echo.
echo 🌐 Páginas disponíveis após deploy:
echo    • /pedidos.html
echo    • /faturamento.html
echo.
echo 💡 Dica: Execute este script diariamente para manter os dados atualizados!
echo.
pause
