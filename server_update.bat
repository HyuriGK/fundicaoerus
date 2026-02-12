@echo off
chcp 65001 > nul
cls
echo ╔════════════════════════════════════════════════════════════╗
echo ║         SERVER UPDATE - ATUALIZAÇÃO GERAL DO SISTEMA       ║
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

REM ===== SINCRONIZAÇÃO DE PRODUCAO =====
echo ┌─────────────────────────────────────────────────────────┐
echo │ [3/3] Sincronizando PRODUCAO (2026)...                 │
echo └─────────────────────────────────────────────────────────┘
echo.
node scripts/sync-production-firebird-postgres.js
if %ERRORLEVEL% NEQ 0 (
    echo   ❌ Erro ao sincronizar producao
    pause
    exit /b 1
)
echo.
echo   ✅ Producao sincronizada com sucesso!
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
echo    • Producao (2026)     → producao_apontada_sincronizada
echo.
echo 🌐 Páginas disponíveis após deploy:
echo    • /pedidos.html
echo    • /faturamento.html
echo    • /apontamentos_produtivos.html
echo.
echo 💡 Dica: Execute este script diariamente para manter os dados atualizados!
echo.
pause
