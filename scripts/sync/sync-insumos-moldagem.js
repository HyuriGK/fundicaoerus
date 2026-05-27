require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const { Pool } = require('pg');
const { Firebird, options: firebirdOptions } = require('../../lib/firebird-helper');

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(/^psql\s+'|'$/g, ''),
    ssl: { rejectUnauthorized: false }
});

console.log('🔄 Sincronizando corridas programadas Firebird → Neon...\n');

async function sync() {
    let firebirdDb;
    let pgClient;

    try {
        pgClient = await pgPool.connect();
        console.log('✅ Conectado ao Neon (PostgreSQL)');

        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS corridas_programadas_sync (
                id SERIAL PRIMARY KEY,
                codigo_cor INTEGER NOT NULL,
                corrida_cor VARCHAR(50),
                data_programada_cor DATE,
                forno_cor VARCHAR(50),
                peso_cor NUMERIC(15,2),
                material_mat VARCHAR(100),
                sequencia_item INTEGER,
                produto_pcp INTEGER,
                pro_empresa_pcp INTEGER,
                nome_pro VARCHAR(500),
                quantidade_programada NUMERIC(15,2),
                quantidade_pcp NUMERIC(15,2),
                peso_pcp NUMERIC(15,2),
                situacao_apontamento VARCHAR(10),
                synced_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(codigo_cor, sequencia_item)
            )
        `);
        await pgClient.query(`ALTER TABLE corridas_programadas_sync ADD COLUMN IF NOT EXISTS data_cor DATE`);
        await pgClient.query(`ALTER TABLE corridas_programadas_sync ADD COLUMN IF NOT EXISTS data_programada_cor DATE`);
        console.log('✅ Tabela corridas_programadas_sync verificada/criada');

        await pgClient.query(`DELETE FROM corridas_programadas_sync`);
        console.log('🗑️  Tabela limpa para re-sincronização');

        firebirdDb = await new Promise((resolve, reject) => {
            Firebird.attach(firebirdOptions, (err, db) => {
                if (err) reject(err);
                else resolve(db);
            });
        });
        console.log('✅ Conectado ao Firebird');

        const rows = await new Promise((resolve, reject) => {
            firebirdDb.query(`
                SELECT
                    c.CODIGO_COR,
                    c.CORRIDA_COR,
                    CAST(c.DATA_COR AS DATE) AS DATA_COR,
                    CAST(c.DATA_PROGRAMADA_COR AS DATE) AS DATA_PROGRAMADA_COR,
                    c.FORNO_COR,
                    c.PESO_COR,
                    m.MATERIAL_MAT,
                    cp.SEQUENCIA_VAZADA_CRPG,
                    cp.QUANTIDADE_PROGRAMADA_CRPG,
                    cp.SITUACAO_APONTAMENTO_CRPG,
                    p.PRODUTO_PCP,
                    p.PRO_EMPRESA_PCP,
                    p.QUANTIDADE_PCP,
                    p.PESO_PCP,
                    pr.NOME_PRO
                FROM CORRIDA c
                LEFT JOIN MATERIAL m ON m.ID_MAT = c.MAT_ID_COR
                LEFT JOIN CORRIDA_PROGRAMADA cp ON cp.COR_CODIGO_CRPG = c.CODIGO_COR
                LEFT JOIN PRODUCAO p
                    ON p.EMPRESA_PCP = cp.PCP_EMPRESA_CRPG
                   AND p.CODIGO_PCP  = cp.PCP_CODIGO_CRPG
                LEFT JOIN PRODUTO pr
                    ON pr.CODIGO_PRO  = p.PRODUTO_PCP
                   AND pr.EMPRESA_PRO = p.PRO_EMPRESA_PCP
                WHERE c.SITUACAO_COR = 'A'
                ORDER BY c.CODIGO_COR DESC, cp.SEQUENCIA_VAZADA_CRPG
            `, (err, result) => {
                if (err) reject(err);
                else resolve(result || []);
            });
        });

        firebirdDb.detach();
        console.log(`📊 ${rows.length} registros encontrados no Firebird`);

        const toNum = v => (v === null || v === undefined || v === '') ? null : parseFloat(v) || null;
        const toInt = v => (v === null || v === undefined || v === '') ? null : parseInt(v, 10) || null;
        const toStr = v => (v === null || v === undefined) ? null : String(v).trim() || null;
        const toDate = v => {
            if (!v) return null;
            if (v instanceof Date) return v.toISOString().split('T')[0];
            return String(v).split('T')[0];
        };

        const BATCH = 500;
        let inserted = 0;

        for (let i = 0; i < rows.length; i += BATCH) {
            const chunk = rows.slice(i, i + BATCH);
            const values = [];
            const placeholders = chunk.map((row, idx) => {
                const base = idx * 15;
                values.push(
                    toInt(row.CODIGO_COR),
                    toStr(row.CORRIDA_COR),
                    toDate(row.DATA_COR),
                    toDate(row.DATA_PROGRAMADA_COR),
                    toStr(row.FORNO_COR),
                    toNum(row.PESO_COR),
                    toStr(row.MATERIAL_MAT),
                    toInt(row.SEQUENCIA_VAZADA_CRPG),
                    toInt(row.PRODUTO_PCP),
                    toInt(row.PRO_EMPRESA_PCP),
                    toStr(row.NOME_PRO),
                    toNum(row.QUANTIDADE_PROGRAMADA_CRPG),
                    toNum(row.QUANTIDADE_PCP),
                    toNum(row.PESO_PCP),
                    toStr(row.SITUACAO_APONTAMENTO_CRPG)
                );
                return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},$${base+15})`;
            });

            await pgClient.query(`
                INSERT INTO corridas_programadas_sync (
                    codigo_cor, corrida_cor, data_cor, data_programada_cor, forno_cor, peso_cor, material_mat,
                    sequencia_item, produto_pcp, pro_empresa_pcp, nome_pro,
                    quantidade_programada, quantidade_pcp, peso_pcp, situacao_apontamento
                ) VALUES ${placeholders.join(',')}
                ON CONFLICT (codigo_cor, sequencia_item) DO NOTHING
            `, values);

            inserted += chunk.length;
            console.log(`  ↳ ${inserted}/${rows.length} inseridos...`);
        }

        console.log(`✅ ${inserted} registros sincronizados com sucesso`);

    } catch (err) {
        console.error('❌ Erro:', err.message);
        process.exit(1);
    } finally {
        if (pgClient) pgClient.release();
        await pgPool.end();
    }
}

sync();
