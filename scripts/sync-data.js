require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');
const { Pool } = require('pg');

// --- CONFIGURAÇÃO ---
const FIREBIRD_OPTIONS = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false, // Manter original para bater com nomes do inspetor
    pageSize: 4096
};

// Função para limpar string de conexão (igual ao lib/db.js)
function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

// Configuração do Postgres
const pgPool = new Pool({
    connectionString: cleanConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false }
});

async function syncData() {
    console.log('🚀 Iniciando sincronização (PEDIDOS 2026)...');

    // 1. Preparar tabela no Postgres
    const client = await pgPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_pedidos (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabela Postgres verificada.');
    } catch (e) {
        console.error('Erro ao criar tabela Postgres:', e);
        return;
    } finally {
        client.release();
    }

    // 2. Conectar no Firebird
    Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
        if (err) {
            console.error('❌ Erro ao conectar no Firebird:', err);
            return;
        }
        console.log('✅ Conectado ao Firebird');

        // 3. Ler dados (JOIN entre PEDIDO_PRODUTO e PEDIDO_PRODUTO_ENTREGA)
        console.log('📥 Lendo dados com JOIN (ANO 2026)...');

        const query = `
            SELECT 
                P.CODIGO_PPR,
                P.PRODUTO_PPR,
                P.NOME_PRODUTO_PPR,
                P.QUANTIDADE_PPR,
                P.PESO_LIQUIDO_NPR,
                P.EMPRESA_PPR,
                P.ANO_PPR,
                P.ITEM_PPR,
                E.ENTREGA_PETR
            FROM PEDIDO_PRODUTO P
            INNER JOIN PEDIDO_PRODUTO_ENTREGA E 
                ON P.CODIGO_PPR = E.PPR_CODIGO_PETR 
                AND P.ANO_PPR = E.PPR_ANO_PETR
                AND P.ITEM_PPR = E.PPR_ITEM_PETR
            WHERE P.ANO_PPR = 2026
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

            // 4. Inserir no Postgres (Batch)
            const pgClient = await pgPool.connect();
            try {
                console.log('📤 Enviando para o Postgres...');

                let successCount = 0;
                let errorCount = 0;

                for (const row of results) {
                    // Criar chave única composta
                    const key = `${row.EMPRESA_PPR}-${row.ANO_PPR}-${row.CODIGO_PPR}-${row.ITEM_PPR}`;

                    try {
                        await pgClient.query(`
                            INSERT INTO firebird_sync_pedidos (sync_key, data, updated_at)
                            VALUES ($1, $2, NOW())
                            ON CONFLICT (sync_key) 
                            DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
                        `, [key, JSON.stringify(row)]);
                        successCount++;
                    } catch (upsertErr) {
                        console.error(`Erro ao salvar registro ${key}:`, upsertErr.message);
                        errorCount++;
                    }

                    // Log de progresso a cada 100 itens
                    if (successCount % 100 === 0) process.stdout.write('.');
                }

                console.log(`\n\n✅ Sincronização concluída!`);
                console.log(`Sucesso: ${successCount}`);
                console.log(`Erros: ${errorCount}`);

            } finally {
                pgClient.release();
                db.detach();
                process.exit(0);
            }
        });
    });
}

syncData();
