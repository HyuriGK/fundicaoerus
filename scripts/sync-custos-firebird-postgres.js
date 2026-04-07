const { Firebird, attachWithRetry } = require('../lib/firebird-helper');
const pool = require('../lib/db');

async function syncCustos() {
    console.log('🚀 Iniciando sincronização de CUSTOS (Histórico Jan/2025)...');

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_custos (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Conectar ao Firebird com Retry
        const db = await attachWithRetry();
        console.log('✅ Conectado ao Firebird com sucesso.');

        // Buscar Custos Granulares (2025/2026)
        const query = `
            SELECT 
                PC.PPR_CODIGO_PPRC, PC.PPR_ITEM_PPRC, PC.PRO_PESO_ESTIMADO_PPRC,
                PC.PRO_PESO_LIQUIDO_PPRC, PC.PRECO_POR_KG_PPRC, PC.PRO_NOME_PPRC,
                P.DATA_PED as DATA_PEDIDO, C.RAZAO_SOCIAL_CLI as CLIENTE
            FROM PRODUTOR_CUSTO PC
            LEFT JOIN PEDIDO P ON PC.PPR_CODIGO_PPRC = P.CODIGO_PED
            LEFT JOIN CLIENTE C ON P.CLIENTE_PED = C.CODIGO_CLI
            WHERE EXTRACT(YEAR FROM P.DATA_PED) IN (2025, 2026)
        `;

        const result = await new Promise((resolve, reject) => {
            db.query(query, [], (err, res) => {
                if (err) reject(err);
                else resolve(res || []);
            });
        });

        console.log(`📦 Encontrados ${result.length} registros de custos no Firebird.`);

        let inserted = 0;
        for (const row of result) {
            const syncKey = `CUS-${row.PPR_CODIGO_PPRC}-${row.PPR_ITEM_PPRC}`;
            await pool.query(`
                INSERT INTO firebird_sync_custos (sync_key, data, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (sync_key) DO UPDATE SET
                    data = EXCLUDED.data,
                    updated_at = CURRENT_TIMESTAMP
            `, [syncKey, row]);

            inserted++;
            if (inserted % 200 === 0 || inserted === result.length) {
                const pct = ((inserted / result.length) * 100).toFixed(0);
                process.stdout.write(`@PROG:CUSTOS:${pct}%\n`);
            }
        }

        // ATUALIZAR STATUS DE SINCRONIZAÇÃO
        try {
            await pool.query("SET TIME ZONE 'America/Sao_Paulo'");
            await pool.query(`
                INSERT INTO sync_status (screen_name, last_sync_at)
                VALUES ('Custos', NOW())
                ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
            `);
            console.log('📊 Status de sincronização atualizado para: Custos');
        } catch (statusErr) {
            console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
        }

        db.detach();
        console.log('✅ Sincronização de custos finalizada com sucesso.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro crítico na sincronização de custos:', error);
        process.exit(1);
    }
}

syncCustos();
