require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
const { Firebird, options } = require('../../lib/firebird-helper');
const pool = require('../../lib/db');
const { randomUUID } = require('crypto');

const queryFirebird = db => new Promise((resolve, reject) => db.query(`
    SELECT
        c.ID_COM AS COMPRA_ID,
        c.TIPO_NOTA_COM AS TIPO_NOTA,
        cp.ITEM_CPR AS ITEM,
        cp.PRODUTO_CPR AS PRODUTO_CODIGO,
        cp.NOME_PRODUTO_CPR AS PRODUTO,
        COALESCE(cpcc.CODIGO_CPCC, 0) AS CENTRO_ITEM_ID,
        c.ENTRADA_COM AS DATA,
        f.CNPJ_CPF_FRN AS CNPJ,
        f.RAZAO_SOCIAL_FRN AS PRESTADOR,
        c.NOTA_COM AS NOTA_FISCAL,
        COALESCE(cpcc.VALOR_CPCC, cp.VALOR_PRODUTOS_CPR, 0) AS VALOR,
        COALESCE(cp.CFOP_CPR, c.CFOP_COM) AS CFOP,
        COALESCE(cp.VALOR_ICMS_CPR, 0) AS IMPOSTO_ICMS,
        COALESCE(cp.VALOR_IPI_CPR, 0) AS IMPOSTO_IPI,
        COALESCE(cp.PIS_VALOR_CPR, 0) AS IMPOSTO_PIS,
        COALESCE(cp.COFINS_VALOR_CPR, 0) AS IMPOSTO_COFINS,
        cc.CODIGO_CTU AS CENTRO_CUSTO_CODIGO,
        cc.NOME_CTU AS CENTRO_CUSTO
    FROM COMPRA c
    JOIN COMPRA_PRODUTO cp ON cp.COM_ID_CPR = c.ID_COM
    LEFT JOIN FORNECEDOR f ON f.CODIGO_FRN = c.FORNECEDOR_COM
    LEFT JOIN COMPRA_PRODUTO_CENTRO_CUSTO cpcc
      ON cpcc.CPR_EMPRESA_CPCC = cp.EMPRESA_CPR
     AND cpcc.CPR_FORNECEDOR_CPCC = cp.FORNECEDOR_CPR
     AND cpcc.CPR_NOTA_CPCC = cp.NOTA_CPR
     AND cpcc.CPR_SERIE_CPCC = cp.SERIE_CPR
     AND cpcc.CPR_ITEM_CPCC = cp.ITEM_CPR
    LEFT JOIN CENTRO_CUSTO cc ON cc.CODIGO_CTU = cpcc.CTU_CODIGO_CPCC
    WHERE c.TIPO_NOTA_COM IN ('55', '57', '99')
`, (error, rows) => error ? reject(error) : resolve(rows || [])));

async function syncNotasServico() {
    const db = await new Promise((resolve, reject) => Firebird.attach(options, (error, conn) => error ? reject(error) : resolve(conn)));
    const client = await pool.connect();
    const batchId = randomUUID();
    try {
        console.log('Iniciando sync de notas de serviço (Firebird -> Neon)');
        const rows = await queryFirebird(db);
        await client.query(`
            CREATE TABLE IF NOT EXISTS contabilidade_sync_batches (
                batch_id UUID PRIMARY KEY,
                status VARCHAR(20) NOT NULL,
                started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMPTZ
            );
            CREATE TABLE IF NOT EXISTS notas_contabilidade_sync (
                batch_id UUID NOT NULL REFERENCES contabilidade_sync_batches(batch_id) ON DELETE CASCADE,
                compra_id BIGINT NOT NULL,
                tipo_nota VARCHAR(10),
                item INTEGER NOT NULL,
                produto_codigo VARCHAR(50),
                produto TEXT,
                centro_item_id BIGINT NOT NULL,
                data DATE,
                cnpj VARCHAR(30),
                prestador TEXT,
                nota_fiscal VARCHAR(80),
                valor NUMERIC(15,2) NOT NULL DEFAULT 0,
                cfop VARCHAR(30),
                icms NUMERIC(15,2) NOT NULL DEFAULT 0,
                ipi NUMERIC(15,2) NOT NULL DEFAULT 0,
                pis NUMERIC(15,2) NOT NULL DEFAULT 0,
                cofins NUMERIC(15,2) NOT NULL DEFAULT 0,
                centro_custo_codigo VARCHAR(30),
                centro_custo TEXT,
                atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (batch_id, compra_id, item, centro_item_id)
            );
            CREATE INDEX IF NOT EXISTS idx_notas_contabilidade_sync_batch_data ON notas_contabilidade_sync (batch_id, data DESC);
            ALTER TABLE notas_contabilidade_sync ADD COLUMN IF NOT EXISTS produto_codigo VARCHAR(50);
            ALTER TABLE notas_contabilidade_sync ADD COLUMN IF NOT EXISTS produto TEXT;
        `);
        await client.query(`INSERT INTO contabilidade_sync_batches (batch_id, status) VALUES ($1, 'running')`, [batchId]);
        await client.query('BEGIN');
        for (let i = 0; i < rows.length; i += 250) {
            const chunk = rows.slice(i, i + 250), values = [], params = [];
            chunk.forEach((row, index) => {
                const n = index * 19;
                values.push(`($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5},$${n + 6},$${n + 7},$${n + 8},$${n + 9},$${n + 10},$${n + 11},$${n + 12},$${n + 13},$${n + 14},$${n + 15},$${n + 16},$${n + 17},$${n + 18},$${n + 19})`);
                params.push(batchId, row.COMPRA_ID, row.TIPO_NOTA, row.ITEM, row.PRODUTO_CODIGO, row.PRODUTO, row.CENTRO_ITEM_ID, row.DATA, row.CNPJ, row.PRESTADOR, row.NOTA_FISCAL, row.VALOR, row.CFOP, row.IMPOSTO_ICMS, row.IMPOSTO_IPI, row.IMPOSTO_PIS, row.IMPOSTO_COFINS, row.CENTRO_CUSTO_CODIGO, row.CENTRO_CUSTO);
            });
            await client.query(`INSERT INTO notas_contabilidade_sync (batch_id,compra_id,tipo_nota,item,produto_codigo,produto,centro_item_id,data,cnpj,prestador,nota_fiscal,valor,cfop,icms,ipi,pis,cofins,centro_custo_codigo,centro_custo) VALUES ${values.join(',')}`, params);
        }
        await client.query(`UPDATE contabilidade_sync_batches SET status = 'completed', completed_at = NOW() WHERE batch_id = $1`, [batchId]);
        await client.query(`DELETE FROM contabilidade_sync_batches WHERE batch_id <> $1 AND status = 'completed'`, [batchId]);
        await client.query(`INSERT INTO sync_status (screen_name, last_sync_at) VALUES ('Contabilidade', NOW()) ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW()`);
        await client.query('COMMIT');
        console.log(`Sync de notas de serviço concluído: ${rows.length} registros.`);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
        db.detach();
        await pool.end();
    }
}

if (require.main === module) syncNotasServico().catch(error => { console.error('Erro no sync de notas de serviço:', error); process.exit(1); });
module.exports = { syncNotasServico };
