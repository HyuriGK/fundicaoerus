require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const { Firebird, options: firebirdOptions } = require('../../lib/firebird-helper');
const pool = require('../../lib/db');

const fbQuery = (db, sql, params = []) =>
    new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));

async function connectFirebird() {
    return new Promise((resolve, reject) => {
        Firebird.attach(firebirdOptions, (err, db) => err ? reject(err) : resolve(db));
    });
}

function readBlob(blob) {
    return new Promise(resolve => {
        if (!blob) return resolve(null);
        if (Buffer.isBuffer(blob)) return resolve(blob.toString('utf-8').trim() || null);
        if (typeof blob !== 'function') return resolve(String(blob).trim() || null);
        blob((err, name, stream) => {
            if (err || !stream) return resolve(null);
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8').trim() || null));
            stream.on('error', () => resolve(null));
        });
    });
}

async function ensureTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS usinagem_externa_fornecedores_sync (
            id SERIAL PRIMARY KEY,
            produto_codigo VARCHAR(80) NOT NULL,
            fornecedor_codigo VARCHAR(80) NOT NULL,
            valor_unitario NUMERIC(15,4),
            observacao TEXT,
            synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_usinagem_ext_forn_produto ON usinagem_externa_fornecedores_sync (produto_codigo);
    `);
}

async function syncValorUsinagem() {
    console.log('Iniciando sync Valor Usinagem (Firebird -> Postgres)');
    const dbFb = await connectFirebird();
    const client = await pool.connect();

    try {
        const rows = await fbQuery(dbFb, `
            SELECT
                PRO_CODIGO_PPRF,
                FRN_CODIGO_PPRF,
                VALOR_UNITARIO_PPRF,
                OBSERVACAO_PPRF
            FROM PRODUTO_PRECO_FORNECEDOR
            WHERE PRO_CODIGO_PPRF IS NOT NULL
            ORDER BY PRO_CODIGO_PPRF, FRN_CODIGO_PPRF
        `);

        await ensureTable(client);
        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE usinagem_externa_fornecedores_sync');

        const batchSize = 500;
        let inserted = 0;
        for (let i = 0; i < rows.length; i += batchSize) {
            const chunk = rows.slice(i, i + batchSize);
            const values = [];
            const params = [];

            for (let idx = 0; idx < chunk.length; idx++) {
                const row = chunk[idx];
                const base = idx * 4;
                values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
                params.push(
                    String(row.PRO_CODIGO_PPRF || '').trim().toUpperCase(),
                    String(row.FRN_CODIGO_PPRF || '').trim().toUpperCase(),
                    row.VALOR_UNITARIO_PPRF === null || row.VALOR_UNITARIO_PPRF === undefined ? null : Number(row.VALOR_UNITARIO_PPRF),
                    await readBlob(row.OBSERVACAO_PPRF)
                );
            }

            await client.query(`
                INSERT INTO usinagem_externa_fornecedores_sync
                    (produto_codigo, fornecedor_codigo, valor_unitario, observacao)
                VALUES ${values.join(',')}
                ON CONFLICT DO NOTHING
            `, params);
            inserted += chunk.length;
        }

        await client.query(`
            INSERT INTO sync_status (screen_name, last_sync_at)
            VALUES ('Valor Usinagem Externa', NOW())
            ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW()
        `);
        await client.query('COMMIT');
        console.log(`Sync Valor Usinagem concluido: ${inserted} registros.`);
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw error;
    } finally {
        client.release();
        dbFb.detach();
        await pool.end();
    }
}

syncValorUsinagem().catch(error => {
    console.error('Erro no sync Valor Usinagem:', error);
    process.exit(1);
});
