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
        // Limpar tabela para garantir que registros excluídos no filtro (Cancelados/Faturados) não permaneçam
        await client.query('DELETE FROM firebird_sync_pedidos');
        console.log('✅ Tabela Postgres verificada e limpa.');
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
                P.VALOR_PPR,
                P.QUANTIDADE_PPR,
                P.QUANTIDADE_FATURADA_PPR,
                P.SALDO_LIBERADO_FATURAR_PPR,
                P.PESO_LIQUIDO_NPR,
                P.EMPRESA_PPR,
                P.ANO_PPR,
                P.ITEM_PPR,
                P.ORDEM_COMPRA_PPR,
                P.STATUS_PPR,
                D.STATUS_PED,
                D.STATUS_DESC_PED,
                E.ENTREGA_PETR,
                D.CLIENTE_PED AS ID_CLIENTE_CORE,
                D.EMISSAO_PED AS DATA_EMISSAO_PEDIDO,
                C.RAZAO_SOCIAL_CLI AS NOME_CLIENTE,
                M.MATERIAL_MAT AS NOME_MATERIAL,
                (
                    SELECT FIRST 1 PS.SETOR_PCS
                    FROM PRODUCAO_SETOR PS
                    WHERE PS.ID_CODIGO_PCS = P.ID_PPR
                        AND PS.STATUS_PCS NOT IN ('T', 'C')
                    ORDER BY PS.ID_PCS DESC
                ) AS ANDAMENTO_PCS
            FROM PEDIDO_PRODUTO P
            LEFT JOIN PEDIDO_PRODUTO_ENTREGA E 
                ON P.CODIGO_PPR = E.PPR_CODIGO_PETR 
                AND P.ANO_PPR = E.PPR_ANO_PETR
                AND P.ITEM_PPR = E.PPR_ITEM_PETR
            LEFT JOIN PEDIDO D
                ON P.CODIGO_PPR = D.CODIGO_PED
                AND P.ANO_PPR = D.ANO_PED
                AND P.EMPRESA_PPR = D.EMPRESA_PED
            LEFT JOIN CLIENTE C
                ON D.CLIENTE_PED = C.CODIGO_CLI
                AND D.CLI_EMPRESA_PED = C.EMPRESA_CLI
            LEFT JOIN PRODUTO_MATERIAL PM 
                ON P.PRODUTO_PPR = PM.PRODUTO_PMT
            LEFT JOIN MATERIAL M 
                ON PM.MAT_ID_PMT = M.ID_MAT
            WHERE P.ANO_PPR IN (2025, 2026)
            AND (P.FATURADO_PPR <> 'T' OR P.FATURADO_PPR IS NULL)
            AND (P.STATUS_PPR <> 'C' OR P.STATUS_PPR IS NULL)
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
