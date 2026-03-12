const Firebird = require('node-firebird');
const pool = require('../lib/db');

// --- CONFIGURATION ---
const FIREBIRD_OPTIONS = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};


async function syncAssertividade() {
    console.log('🚀 Iniciando sincronização (ASSERTIVIDADE 2025/2026)...');

    // 1. Prepare table in Postgres
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_assertividade (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Clear table to ensure consistency
        await pool.query('DELETE FROM firebird_sync_assertividade');
        console.log('✅ Tabela Postgres firebird_sync_assertividade verificada e limpa.');
    } catch (e) {
        console.error('Erro ao criar tabela Postgres:', e);
        return;
    }

    // 2. Connect to Firebird
    Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
        if (err) {
            console.error('❌ Erro ao conectar no Firebird:', err);
            return;
        }
        console.log('✅ Conectado ao Firebird');

        // 3. Read data
        console.log('📥 Lendo dados de PEDIDO_PRODUTO_ENTREGA (2025/2026)...');

        const query = `
            SELECT 
                E.PPR_CODIGO_PETR,
                E.PPR_ANO_PETR,
                E.PPR_ITEM_PETR,
                E.PPR_EMPRESA_PETR,
                E.PRO_CODIGO_PETR,
                E.ENTREGA_PETR,
                E.DATA_PETR,
                E.QUANTIDADE_FATURADA_PETR,
                C.RAZAO_SOCIAL_CLI AS NOME_CLIENTE,
                P.NOME_PRODUTO_PPR
            FROM PEDIDO_PRODUTO_ENTREGA E
            LEFT JOIN PEDIDO D ON E.PPR_CODIGO_PETR = D.CODIGO_PED AND E.PPR_ANO_PETR = D.ANO_PED AND E.PPR_EMPRESA_PETR = D.EMPRESA_PED
            LEFT JOIN CLIENTE C ON D.CLIENTE_PED = C.CODIGO_CLI AND D.CLI_EMPRESA_PED = C.EMPRESA_CLI
            LEFT JOIN PEDIDO_PRODUTO P ON E.PPR_CODIGO_PETR = P.CODIGO_PPR AND E.PPR_ANO_PETR = P.ANO_PPR AND E.PPR_ITEM_PETR = P.ITEM_PPR AND E.PPR_EMPRESA_PETR = P.EMPRESA_PPR
            WHERE E.PPR_ANO_PETR IN (2025, 2026)
              AND E.QUANTIDADE_FATURADA_PETR > 0
        `;

        db.query(query, async function (err, results) {
            if (err) {
                console.error('Erro na query Firebird:', err);
                db.detach();
                return;
            }

            console.log(`📊 ${results.length} registros encontrados.`);

            if (results.length === 0) {
                console.log('Nada para sincronizar.');
                db.detach();
                return;
            }

            // 4. Insert into Postgres (Batch)
            try {
                console.log('📤 Enviando para o Postgres...');

                let successCount = 0;
                let errorCount = 0;

                for (const row of results) {
                    // Create composite unique key
                    const key = `${row.PPR_EMPRESA_PETR}-${row.PPR_ANO_PETR}-${row.PPR_CODIGO_PETR}-${row.PPR_ITEM_PETR}`;

                    try {
                        await pool.query(`
                            INSERT INTO firebird_sync_assertividade (sync_key, data, updated_at)
                            VALUES ($1, $2, NOW())
                            ON CONFLICT (sync_key) 
                            DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
                        `, [key, JSON.stringify(row)]);
                        successCount++;
                    } catch (upsertErr) {
                        console.error(`Erro ao salvar registro ${key}:`, upsertErr.message);
                        errorCount++;
                    }

                    if (successCount % 100 === 0) process.stdout.write('.');
                }

                console.log(`\n\n✅ Sincronização de assertividade concluída!`);
                console.log(`Sucesso: ${successCount}`);
                console.log(`Erros: ${errorCount}`);

                // ATUALIZAR STATUS DE SINCRONIZAÇÃO
                try {
                    await pool.query(`
                        INSERT INTO sync_status (screen_name, last_sync_at)
                        VALUES ('Assertividade', NOW())
                        ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
                    `);
                    console.log('📊 Status de sincronização atualizado para: Assertividade');
                } catch (statusErr) {
                    console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
                }

            } finally {
                db.detach();
                process.exit(0);
            }
        });
    });
}

syncAssertividade();
