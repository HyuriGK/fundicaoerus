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
    lowercase_keys: false,
    pageSize: 4096
};

function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

const pgPool = new Pool({
    connectionString: cleanConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false }
});

async function syncEmissoes() {
    console.log('🚀 Iniciando sincronização de EMISSÕES (Histórico 2024+)...');

    const client = await pgPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_emissoes (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Limpar tabela para garantir sincronização limpa do histórico
        await client.query('DELETE FROM firebird_sync_emissoes');
        console.log('✅ Tabela firebird_sync_emissoes verificada e limpa.');
    } catch (e) {
        console.error('Erro ao criar tabela Postgres:', e);
        client.release();
        return;
    } finally {
        client.release();
    }

    Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
        if (err) {
            console.error('❌ Erro ao conectar no Firebird:', err);
            return;
        }
        console.log('✅ Conectado ao Firebird');

        const query = `
            SELECT 
                P.CODIGO_PPR,
                P.PRODUTO_PPR,
                P.NOME_PRODUTO_PPR,
                CASE 
                    WHEN PC.PPR_CODIGO_PPRC IS NOT NULL THEN 
                         CAST(PC.PRECO_POR_KG_PPRC * (
                            CASE 
                                WHEN COALESCE(PC.PRO_PESO_LIQUIDO_PPRC, 0) > 0 THEN PC.PRO_PESO_LIQUIDO_PPRC 
                                ELSE COALESCE(PC.PRO_PESO_ESTIMADO_PPRC, 0) 
                            END
                        ) AS DECIMAL(18,4))
                    ELSE P.VALOR_PPR 
                END AS VALOR_PPR,
                CAST(PC.PRECO_POR_KG_PPRC AS DECIMAL(18,4)) AS PRECO_KG,
                P.QUANTIDADE_PPR,
                P.PESO_LIQUIDO_NPR,
                P.EMPRESA_PPR,
                P.ANO_PPR,
                P.ITEM_PPR,
                P.ORDEM_COMPRA_PPR,
                D.EMISSAO_PED AS DATA_EMISSAO_PEDIDO,
                C.RAZAO_SOCIAL_CLI AS NOME_CLIENTE,
                C.CODIGO_CLI AS ID_CLIENTE_CORE,
                M.MATERIAL_MAT AS NOME_MATERIAL
            FROM PEDIDO_PRODUTO P
            INNER JOIN PEDIDO D
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
            LEFT JOIN PEDIDO_PRODUTO_CALCULO_PRECO PC
                ON P.CODIGO_PPR = PC.PPR_CODIGO_PPRC
                AND P.ANO_PPR = PC.PPR_ANO_PPRC
                AND P.ITEM_PPR = PC.PPR_ITEM_PPRC
                AND P.EMPRESA_PPR = PC.PPR_EMPRESA_PPRC
            WHERE EXTRACT(YEAR FROM D.EMISSAO_PED) IN (2025, 2026)
            AND D.STATUS_PED <> 'C'
        `;

        db.query(query, async function (err, results) {
            if (err) {
                console.error('Erro na query Firebird:', err);
                db.detach();
                return;
            }

            console.log(`📊 ${results.length} registros de emissão encontrados.`);

            if (results.length === 0) {
                db.detach();
                return;
            }

            const pgClient = await pgPool.connect();
            try {
                console.log('📤 Enviando para o Postgres...');
                let successCount = 0;

                for (const row of results) {
                    const key = `${row.EMPRESA_PPR}-${row.ANO_PPR}-${row.CODIGO_PPR}-${row.ITEM_PPR}`;
                    await pgClient.query(`
                        INSERT INTO firebird_sync_emissoes (sync_key, data, updated_at)
                        VALUES ($1, $2, NOW())
                        ON CONFLICT (sync_key) 
                        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
                    `, [key, JSON.stringify(row)]);
                    successCount++;
                    if (successCount % 100 === 0) process.stdout.write('.');
                }

                console.log(`\n\n✅ Sincronização de EMISSÕES concluída!`);
                console.log(`Sucesso: ${successCount}`);

                // ATUALIZAR STATUS DE SINCRONIZAÇÃO
                try {
                    await pgClient.query(`
                        INSERT INTO sync_status (screen_name, last_sync_at)
                        VALUES ('Emissões', NOW())
                        ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
                    `);
                    console.log('📊 Status de sincronização atualizado para: Emissões');
                } catch (statusErr) {
                    console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
                }

            } catch (pgErr) {
                console.error('Erro ao salvar no Postgres:', pgErr);
            } finally {
                pgClient.release();
                db.detach();
                process.exit(0);
            }
        });
    });
}

syncEmissoes();
