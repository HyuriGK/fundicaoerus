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
    console.log('✅ Tabela balanco_pagamentos verificada');
}

function queryFirebird() {
    return new Promise((resolve, reject) => {
        Firebird.attach(firebirdOptions, (err, db) => {
            if (err) return reject(err);

            const sql = `
                SELECT
                    p.CODIGO_PAP,
                    p.DESPESA_PAP,
                    p.VALOR_PAP,
                    p.DATA_BAIXA_PAP,
                    p.HISTORICO_CAIXA_PAP
                FROM PAGAR_PAGAMENTO p
                WHERE p.DATA_BAIXA_PAP >= '2025-01-01'
                  AND p.DATA_BAIXA_PAP < '2027-01-01'
                  AND p.DATA_BAIXA_PAP IS NOT NULL
            `;

            db.query(sql, (err, rows) => {
                db.detach();
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    });
}

async function sync() {
    console.log('🔄 Iniciando sync de pagamentos Firebird → Postgres...');

    const rows = await queryFirebird();
    console.log(`📦 ${rows.length} registros lidos do Firebird`);

    const client = await pool.connect();
    try {
        await createTable(client);
        await client.query('BEGIN');

        let upserted = 0;
        for (const r of rows) {
            const codigo = String(r.CODIGO_PAP || '').trim();
            if (!codigo) continue;

            const despesa = r.DESPESA_PAP != null ? String(r.DESPESA_PAP).trim() : null;
            const valor = parseFloat(r.VALOR_PAP) || 0;
            const data = r.DATA_BAIXA_PAP ? new Date(r.DATA_BAIXA_PAP).toISOString().split('T')[0] : null;
            const historico = r.HISTORICO_CAIXA_PAP ? String(r.HISTORICO_CAIXA_PAP).trim() : null;

            await client.query(`
                INSERT INTO balanco_pagamentos (codigo_pap, despesa_pap, valor_pap, data_baixa_pap, historico_pap, sincronizado_em)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (codigo_pap) DO UPDATE SET
                    despesa_pap     = EXCLUDED.despesa_pap,
                    valor_pap       = EXCLUDED.valor_pap,
                    data_baixa_pap  = EXCLUDED.data_baixa_pap,
                    historico_pap   = EXCLUDED.historico_pap,
                    sincronizado_em = NOW()
            `, [codigo, despesa, valor, data, historico]);
            upserted++;
        }

        await client.query('COMMIT');
        console.log(`✅ ${upserted} registros sincronizados com sucesso`);
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
    .catch(e => { console.error('❌ Erro no sync:', e.message); process.exit(1); });
