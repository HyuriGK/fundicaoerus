require('dotenv').config({ path: '.env.local' });
const { Firebird, options: firebirdOptions } = require('../lib/firebird-helper');
const pool = require('../lib/db');

async function createTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS balanco_pagamentos (
            codigo_pap       VARCHAR(50) PRIMARY KEY,
            despesa_pap      VARCHAR(50),
            valor_pap        NUMERIC(15,2),
            data_baixa_pap   DATE,
            historico_pap    TEXT,
            sincronizado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

function queryFirebird() {
    return new Promise((resolve, reject) => {
        Firebird.attach(firebirdOptions, (err, db) => {
            if (err) return reject(err);
            db.query(`
                SELECT p.CODIGO_PAP, p.DESPESA_PAP, p.VALOR_PAP,
                       p.DATA_BAIXA_PAP, p.HISTORICO_CAIXA_PAP
                FROM PAGAR_PAGAMENTO p
                WHERE p.DATA_BAIXA_PAP >= '2025-01-01'
                  AND p.DATA_BAIXA_PAP < '2027-01-01'
                  AND p.DATA_BAIXA_PAP IS NOT NULL
            `, (err, rows) => {
                db.detach();
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    });
}

async function sync() {
    console.log('🔄 Iniciando sync Firebird → Postgres...');

    const rows = await queryFirebird();
    console.log(`📦 ${rows.length} registros lidos do Firebird`);

    const client = await pool.connect();
    try {
        await createTable(client);

        // Prepara os dados
        const records = rows
            .map(r => ({
                codigo:   String(r.CODIGO_PAP || '').trim(),
                despesa:  r.DESPESA_PAP != null ? String(r.DESPESA_PAP).trim() : null,
                valor:    parseFloat(r.VALOR_PAP) || 0,
                data:     r.DATA_BAIXA_PAP ? new Date(r.DATA_BAIXA_PAP).toISOString().split('T')[0] : null,
                historico: r.HISTORICO_CAIXA_PAP ? String(r.HISTORICO_CAIXA_PAP).trim() : null,
            }))
            .filter(r => r.codigo);

        const BATCH = 500;
        let total = 0;

        await client.query('BEGIN');

        // Truncate e reinsere — mais rápido que upsert linha a linha
        await client.query('TRUNCATE TABLE balanco_pagamentos');

        for (let i = 0; i < records.length; i += BATCH) {
            const chunk = records.slice(i, i + BATCH);

            // Monta VALUES ($1,$2,...),($6,$7,...) dinamicamente
            const values = [];
            const placeholders = chunk.map((r, idx) => {
                const base = idx * 5;
                values.push(r.codigo, r.despesa, r.valor, r.data, r.historico);
                return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},NOW())`;
            });

            await client.query(`
                INSERT INTO balanco_pagamentos
                    (codigo_pap,despesa_pap,valor_pap,data_baixa_pap,historico_pap,sincronizado_em)
                VALUES ${placeholders.join(',')}
            `, values);

            total += chunk.length;
            process.stdout.write(`\r⏳ ${total}/${records.length} inseridos...`);
        }

        await client.query('COMMIT');
        console.log(`\n✅ ${total} registros sincronizados com sucesso`);
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
        await pool.end();
    }
}

sync()
    .then(() => { console.log('🏁 Sync concluído'); process.exit(0); })
    .catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
