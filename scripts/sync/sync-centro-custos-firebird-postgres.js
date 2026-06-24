require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
const { Firebird, options: FIREBIRD_OPTIONS } = require('../../lib/firebird-helper');
const pool = require('../../lib/db');

const fbQuery = (db, sql, params = []) =>
    new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));

async function connectFirebird() {
    return new Promise((resolve, reject) => {
        Firebird.attach(FIREBIRD_OPTIONS, (err, db) => err ? reject(err) : resolve(db));
    });
}

async function ensureTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS centro_custos_firebird (
            codigo INTEGER PRIMARY KEY,
            empresa INTEGER,
            nome VARCHAR(255) NOT NULL,
            ativo CHAR(1),
            tipo_mascara INTEGER NOT NULL,
            tipo VARCHAR(20) NOT NULL,
            mascara VARCHAR(50),
            atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_centro_custos_firebird_mascara ON centro_custos_firebird (mascara);
        CREATE INDEX IF NOT EXISTS idx_centro_custos_firebird_tipo ON centro_custos_firebird (tipo);
        CREATE INDEX IF NOT EXISTS idx_centro_custos_firebird_ativo ON centro_custos_firebird (ativo);
    `);
}

async function syncCentroCustos() {
    console.log('Iniciando sync Centro de Custo (Firebird -> Postgres)');
    const dbFb = await connectFirebird();
    const client = await pool.connect();

    try {
        const rows = await fbQuery(dbFb, `
            SELECT
                CODIGO_CTU,
                EMP_CODIGO_CTU,
                NOME_CTU,
                ATIVO_CTU,
                TIPO_MASCARA_CTU,
                MASCARA_CTU
            FROM CENTRO_CUSTO
            ORDER BY MASCARA_CTU
        `);

        await ensureTable(client);
        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE centro_custos_firebird');

        const batchSize = 200;
        let inserted = 0;
        for (let i = 0; i < rows.length; i += batchSize) {
            const chunk = rows.slice(i, i + batchSize);
            const values = [];
            const params = [];

            chunk.forEach((row, idx) => {
                const base = idx * 7;
                values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
                const tipoMascara = Number(row.TIPO_MASCARA_CTU);
                params.push(
                    row.CODIGO_CTU,
                    row.EMP_CODIGO_CTU,
                    String(row.NOME_CTU || '').replace(/\s+/g, ' ').trim(),
                    String(row.ATIVO_CTU || '').trim(),
                    tipoMascara,
                    tipoMascara === 1 ? 'SINTETICA' : 'ANALITICA',
                    String(row.MASCARA_CTU || '').trim()
                );
            });

            await client.query(`
                INSERT INTO centro_custos_firebird
                    (codigo, empresa, nome, ativo, tipo_mascara, tipo, mascara)
                VALUES ${values.join(',')}
            `, params);
            inserted += chunk.length;
        }

        await client.query(`
            INSERT INTO sync_status (screen_name, last_sync_at)
            VALUES ('Centro de Custo', NOW())
            ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW()
        `);
        await client.query('COMMIT');
        console.log(`Sync Centro de Custo concluido: ${inserted} registros.`);
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw error;
    } finally {
        client.release();
        dbFb.detach();
        await pool.end();
    }
}

if (require.main === module) {
    syncCentroCustos().catch(err => {
        console.error('Erro no sync Centro de Custo:', err);
        process.exit(1);
    });
}

module.exports = { syncCentroCustos };
