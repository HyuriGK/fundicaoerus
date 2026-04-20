require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const { Pool } = require('pg');

// Configuração do Firebird
const { Firebird, options: firebirdOptions } = require('../../lib/firebird-helper');

// Configuração do PostgreSQL (Neon)
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(/^psql\s+'|'$/g, ''),
    ssl: { rejectUnauthorized: false }
});

console.log('🔄 Iniciando sincronização Firebird → Neon...\n');

async function syncFaturamento() {
    let firebirdDb;
    let pgClient;

    try {
        // 1. Conectar ao PostgreSQL (Neon)
        pgClient = await pgPool.connect();
        console.log('✅ Conectado ao Neon (PostgreSQL)');

        // Janela de sincronização: 120 dias
        const startDateObj = new Date();
        startDateObj.setDate(startDateObj.getDate() - 120);
        const startDate = startDateObj.toISOString().split('T')[0];
        console.log(`📅 Janela de Sincronização: ${startDate} até hoje (120 dias).`);

        // 2. Criar tabela se não existir
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS faturamento_firebird (
                id SERIAL PRIMARY KEY,
                data_faturamento DATE,
                nota_fiscal INTEGER,
                cliente_codigo INTEGER,
                cliente_nome VARCHAR(500),
                codigo_item BIGINT,
                descricao VARCHAR(500),
                quantidade NUMERIC(15, 2),
                valor_unitario NUMERIC(15, 2),
                valor_total NUMERIC(15, 2),
                serie VARCHAR(10),
                status VARCHAR(10),
                sincronizado_em TIMESTAMP DEFAULT NOW(),
                UNIQUE(nota_fiscal, codigo_item, serie)
            )
        `);
        console.log('✅ Tabela faturamento_firebird verificada/criada');

        // 3. Limpar dados da janela (para re-sincronizar)
        await pgClient.query(`
            DELETE FROM faturamento_firebird
            WHERE data_faturamento >= $1
        `, [startDate]);
        console.log(`🗑️  Dados da janela (${startDate} em diante) removidos`);

        // 4. Conectar ao Firebird
        firebirdDb = await new Promise((resolve, reject) => {
            Firebird.attach(firebirdOptions, (err, db) => {
                if (err) reject(err);
                else resolve(db);
            });
        });
        console.log('✅ Conectado ao Firebird');

        // 5. Buscar dados do Firebird
        const firebirdData = await new Promise((resolve, reject) => {
            const query = `
                SELECT
                    nf.EMISSAO_NOT as DATA_FATURAMENTO,
                    nf.NUMERO_NOT as NOTA_FISCAL,
                    nf.DESTINATARIO_NOT as CLIENTE_CODIGO,
                    nf.RAZAO_SOCIAL_NOT as CLIENTE_NOME,
                    nfp.PRODUTO_NPR as CODIGO_ITEM,
                    nfp.NOME_PRODUTO_NPR as DESCRICAO,
                    nfp.QUANTIDADE_NPR as QUANTIDADE,
                    nfp.PRECO_NPR as VALOR_UNITARIO,
                    nfp.TOTAL_NPR as VALOR_TOTAL,
                    nf.SERIE_NOT as SERIE,
                    nf.STATUS_NOT as STATUS
                FROM NOTA_FISCAL nf
                INNER JOIN NOTA_FISCAL_PRODUTO nfp 
                    ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
                    AND nf.SERIE_NOT = nfp.SERIE_NPR
                    AND nf.CODIGO_NOT = nfp.CODIGO_NPR
                WHERE nf.EMISSAO_NOT >= '${startDate}'
                    AND nf.EMISSAO_NOT < '2027-01-01'
                    AND nf.TIPO_NOT = 'S'
                    AND nf.STATUS_NOT = 'A'
                    AND nfp.STATUS_NPR = 'A'
                    AND nfp.PRODUTO_NPR IS NOT NULL
                ORDER BY nf.EMISSAO_NOT DESC, nf.NUMERO_NOT DESC
            `;

            firebirdDb.query(query, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        console.log(`📊 ${firebirdData.length} registros encontrados no Firebird`);

        // 6. Inserir dados no Neon
        let insertedCount = 0;
        for (const row of firebirdData) {
            try {
                await pgClient.query(`
                    INSERT INTO faturamento_firebird (
                        data_faturamento, nota_fiscal, cliente_codigo, cliente_nome, codigo_item,
                        descricao, quantidade, valor_unitario, valor_total, serie, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (nota_fiscal, codigo_item, serie) DO UPDATE SET
                        data_faturamento = EXCLUDED.data_faturamento,
                        cliente_codigo = EXCLUDED.cliente_codigo,
                        cliente_nome = EXCLUDED.cliente_nome,
                        descricao = EXCLUDED.descricao,
                        quantidade = EXCLUDED.quantidade,
                        valor_unitario = EXCLUDED.valor_unitario,
                        valor_total = EXCLUDED.valor_total,
                        status = EXCLUDED.status,
                        sincronizado_em = NOW()
                `, [
                    row.DATA_FATURAMENTO,
                    row.NOTA_FISCAL,
                    row.CLIENTE_CODIGO,
                    row.CLIENTE_NOME ? (typeof row.CLIENTE_NOME === 'string' ? row.CLIENTE_NOME.trim() : String(row.CLIENTE_NOME)) : null,
                    row.CODIGO_ITEM,
                    row.DESCRICAO ? (typeof row.DESCRICAO === 'string' ? row.DESCRICAO.trim() : String(row.DESCRICAO)) : null,
                    (row.QUANTIDADE || 0),
                    (row.VALOR_UNITARIO || 0),
                    (row.VALOR_TOTAL || 0),
                    row.SERIE ? (typeof row.SERIE === 'string' ? row.SERIE.trim() : String(row.SERIE)) : null,
                    row.STATUS ? (typeof row.STATUS === 'string' ? row.STATUS.trim() : String(row.STATUS)) : null
                ]);
                insertedCount++;

                if (insertedCount % 100 === 0 || insertedCount === firebirdData.length) {
                    const pct = ((insertedCount / firebirdData.length) * 100).toFixed(0);
                    process.stdout.write(`@PROG:FATURAMENTO:${pct}%\n`);
                }
            } catch (err) {
                console.error(`  ⚠️  Erro ao inserir registro:`, err.message);
            }
        }

        console.log(`\n✅ Sincronização concluída!`);
        console.log(`📊 Total inserido/atualizado: ${insertedCount} registros`);

        // ATUALIZAR STATUS DE SINCRONIZAÇÃO
        try {
            await pgClient.query("SET TIME ZONE 'America/Sao_Paulo'");
            await pgClient.query(`
                INSERT INTO sync_status (screen_name, last_sync_at)
                VALUES ('Faturamento', NOW())
                ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
            `);
            console.log('📊 Status de sincronização atualizado para: Faturamento');
        } catch (statusErr) {
            console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
        }

        // 7. Verificar total no Neon
        const countResult = await pgClient.query(`
            SELECT COUNT(*) as total,
                   SUM(valor_total) as total_faturado
            FROM faturamento_firebird
            WHERE data_faturamento >= $1
        `, [startDate]);

        console.log(`\n💾 Dados no Neon:`);
        console.log(`   Total de registros: ${countResult.rows[0].total}`);
        console.log(`   Total faturado: R$ ${parseFloat(countResult.rows[0].total_faturado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

    } catch (error) {
        console.error('\n❌ Erro na sincronização:', error);
        throw error;
    } finally {
        // Fechar conexões
        if (firebirdDb) {
            firebirdDb.detach();
            console.log('\n🔌 Desconectado do Firebird');
        }
        if (pgClient) {
            pgClient.release();
            console.log('🔌 Desconectado do Neon');
        }
    }
}

// Executar sincronização
syncFaturamento()
    .then(() => {
        console.log('\n✅ Script finalizado com sucesso!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script finalizado com erro:', error);
        process.exit(1);
    });
