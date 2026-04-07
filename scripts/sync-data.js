const { Firebird, attachWithRetry } = require('../lib/firebird-helper');
const pool = require('../lib/db');

async function syncPedidos() {
    console.log('🚀 Iniciando sincronização de PEDIDOS (Histórico 2025/2026)...');

    try {
        // 1. Criar Tabelas no Postgres
        await pool.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_pedidos (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS firebird_sync_emissoes (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Conectar ao Firebird com Retry
        const db = await attachWithRetry();
        console.log('✅ Conectado ao Firebird com sucesso.');

        // Buscar Pedidos/Faturamentos Ativos (2025/2026)
        const query = `
            SELECT 
                P.CODIGO_PED, P.CODIGO_CLI_PED, P.DATA_PED, P.DATA_ENTREGA_PED,
                P.VALOR_TOTAL_PED, P.STATUS_PED, P.STATUS_PRODUCAO_PED,
                P.ORDEM_COMPRA_PED, P.CLIENTE_PED, P.VENDEDOR_PED,
                C.RAZAO_SOCIAL_CLI AS NOME_CLIENTE,
                CASE 
                    WHEN P.STATUS_PED = 'C' THEN 'Cancelado'
                    WHEN P.STATUS_PED = 'F' THEN 'Faturado'
                    WHEN P.STATUS_PED = 'P' THEN 'Pendente'
                    ELSE 'Outro'
                END AS STATUS_DESCRITIVO
            FROM PEDIDO P
            LEFT JOIN CLIENTE C ON P.CLIENTE_PED = C.CODIGO_CLI
            WHERE EXTRACT(YEAR FROM P.DATA_PED) IN (2025, 2026)
        `;

        const result = await new Promise((resolve, reject) => {
            db.query(query, [], (err, res) => {
                if (err) reject(err);
                else resolve(res || []);
            });
        });

        console.log(`📦 Encontrados ${result.length} pedidos no Firebird.`);

        let inserted = 0;
        for (const row of result) {
            const syncKey = `PED-${row.CODIGO_PED}`;
            await pool.query(`
                INSERT INTO firebird_sync_pedidos (sync_key, data, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (sync_key) DO UPDATE SET
                    data = EXCLUDED.data,
                    updated_at = CURRENT_TIMESTAMP
            `, [syncKey, row]);

            inserted++;
            if (inserted % 100 === 0 || inserted === result.length) {
                const pct = ((inserted / result.length) * 100).toFixed(0);
                process.stdout.write(`@PROG:PEDIDOS:${pct}%\n`);
            }
        }

        // ATUALIZAR STATUS DE SINCRONIZAÇÃO
        try {
            await pool.query("SET TIME ZONE 'America/Sao_Paulo'");
            await pool.query(`
                INSERT INTO sync_status (screen_name, last_sync_at)
                VALUES ('Pedidos', NOW())
                ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
            `);
            console.log('📊 Status de sincronização atualizado para: Pedidos');
        } catch (statusErr) {
            console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
        }

        db.detach();
        console.log('✅ Sincronização de pedidos finalizada com sucesso.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro crítico na sincronização de pedidos:', error);
        process.exit(1);
    }
}

syncPedidos();
