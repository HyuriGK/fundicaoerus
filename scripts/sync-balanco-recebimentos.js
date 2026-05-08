require('dotenv').config({ path: '.env.local' });
const { Firebird, options: firebirdOptions } = require('../lib/firebird-helper');
const pool = require('../lib/db');

async function createTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS balanco_recebimentos (
            codigo_rcp           VARCHAR(50) PRIMARY KEY,
            valor_rcp            NUMERIC(15,2),
            data_pagamento_rcp   DATE,
            historico_rcp        TEXT,
            sincronizado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Tabela balanco_recebimentos verificada');
}

function queryFirebird() {
    return new Promise((resolve, reject) => {
        Firebird.attach(firebirdOptions, (err, db) => {
            if (err) return reject(err);
            db.query(`
                SELECT
                    r.CODIGO_RCP,
                    r.VALOR_RCP,
                    r.DATA_PAGAMENTO_RCP,
                    r.HISTORICO_CAIXA_RCB
                FROM RECEBER_PAGAMENTO r
                WHERE r.DATA_PAGAMENTO_RCP >= '2025-01-01'
                  AND r.DATA_PAGAMENTO_RCP < '2027-01-01'
                  AND r.DATA_PAGAMENTO_RCP IS NOT NULL
            `, (err, rows) => {
                db.detach();
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    });
}

async function sync() {
    console.log('🔄 Iniciando sync de recebimentos Firebird → Postgres...');
    const rows = await queryFirebird();
    console.log(`📦 ${rows.length} registros lidos do Firebird`);

    const client = await pool.connect();
    try {
        await createTable(client);

        const records = rows
            .map(r => ({
                codigo:    String(r.CODIGO_RCP || '').trim(),
                valor:     parseFloat(r.VALOR_RCP) || 0,
                data:      r.DATA_PAGAMENTO_RCP ? new Date(r.DATA_PAGAMENTO_RCP).toISOString().split('T')[0] : null,
                historico: r.HISTORICO_CAIXA_RCB ? String(r.HISTORICO_CAIXA_RCB).trim() : null,
            }))
            .filter(r => r.codigo);

        const BATCH = 500;
        let total = 0;

        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE balanco_recebimentos');

        for (let i = 0; i < records.length; i += BATCH) {
            const chunk = records.slice(i, i + BATCH);
            const values = [];
            const placeholders = chunk.map((r, idx) => {
                const base = idx * 4;
                values.push(r.codigo, r.valor, r.data, r.historico);
                return `($${base+1},$${base+2},$${base+3},$${base+4},NOW())`;
            });
            await client.query(`
                INSERT INTO balanco_recebimentos
                    (codigo_rcp,valor_rcp,data_pagamento_rcp,historico_rcp,sincronizado_em)
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
