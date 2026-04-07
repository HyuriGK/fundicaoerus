const { Firebird, attachWithRetry } = require('../lib/firebird-helper');
const pool = require('../lib/db');

async function syncFaturamento() {
    console.log('🚀 Iniciando sincronização de FATURAMENTO (Histórico 2025/2026)...');

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_faturamento (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Conectar ao Firebird com Retry
        const db = await attachWithRetry();
        console.log('✅ Conectado ao Firebird com sucesso.');

        // Buscar Faturamentos (2025/2026)
        const query = `
            SELECT 
                N.CODIGO_NOT, N.NUMERO_NOT, N.SERIE_NOT, N.DATA_EMISSAO_NOT, N.VALOR_TOTAL_NOT,
                C.RAZAO_SOCIAL_CLI AS NOME_CLIENTE, C.CODIGO_CLI AS CODIGO_CLIENTE,
                N.PEDIDO_NOT AS CODIGO_PEDIDO,
                (SELECT SUM(QUANTIDADE_NFP * PRECO_UNITARIO_NFP) FROM NOTA_FISCAL_PRODUTO WHERE NOTA_FISCAL_NFP = N.CODIGO_NOT) as VALOR_PRODUTOS
            FROM NOTA_FISCAL N
            LEFT JOIN CLIENTE C ON N.CLIENTE_NOT = C.CODIGO_CLI
            WHERE EXTRACT(YEAR FROM N.DATA_EMISSAO_NOT) IN (2025, 2026)
        `;

        const result = await new Promise((resolve, reject) => {
            db.query(query, [], (err, res) => {
                if (err) reject(err);
                else resolve(res || []);
            });
        });

        console.log(`📦 Encontrados ${result.length} registros de faturamento no Firebird.`);

        let inserted = 0;
        for (const row of result) {
            const syncKey = `FAT-${row.CODIGO_NOT}`;
            await pool.query(`
                INSERT INTO firebird_sync_faturamento (sync_key, data, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (sync_key) DO UPDATE SET
                    data = EXCLUDED.data,
                    updated_at = CURRENT_TIMESTAMP
            `, [syncKey, row]);

            inserted++;
            if (inserted % 100 === 0 || inserted === result.length) {
                const pct = ((inserted / result.length) * 100).toFixed(0);
                process.stdout.write(`@PROG:FATURAMENTO:${pct}%\n`);
            }
        }

        // ATUALIZAR STATUS DE SINCRONIZAÇÃO
        try {
            await pool.query("SET TIME ZONE 'America/Sao_Paulo'");
            await pool.query(`
                INSERT INTO sync_status (screen_name, last_sync_at)
                VALUES ('Faturamento', NOW())
                ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
            `);
            console.log('📊 Status de sincronização atualizado para: Faturamento');
        } catch (statusErr) {
            console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
        }

        db.detach();
        console.log('✅ Sincronização de faturamento finalizada com sucesso.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro crítico na sincronização de faturamento:', error);
        process.exit(1);
    }
}

syncFaturamento();
