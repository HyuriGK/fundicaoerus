require('dotenv').config({ path: '.env.local' });
const { Firebird, options: firebirdOptions } = require('../lib/firebird-helper');
const pool = require('../lib/db');

async function createTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS balanco_despesas (
            codigo_des  VARCHAR(50) PRIMARY KEY,
            nome_des    TEXT,
            sincronizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Tabela balanco_despesas verificada');
}

function queryFirebird() {
    return new Promise((resolve, reject) => {
        Firebird.attach(firebirdOptions, (err, db) => {
            if (err) return reject(err);
            db.query(`SELECT CODIGO_DES, NOME_DES FROM DESPESA`, (err, rows) => {
                db.detach();
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    });
}

async function sync() {
    console.log('🔄 Iniciando sync de despesas Firebird → Postgres...');
    const rows = await queryFirebird();
    console.log(`📦 ${rows.length} registros lidos do Firebird`);

    const client = await pool.connect();
    try {
        await createTable(client);

        const records = rows
            .map(r => ({
                codigo: String(r.CODIGO_DES || '').trim(),
                nome:   r.NOME_DES ? String(r.NOME_DES).trim() : null,
            }))
            .filter(r => r.codigo);

        const BATCH = 500;
        let total = 0;

        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE balanco_despesas');

        for (let i = 0; i < records.length; i += BATCH) {
            const chunk = records.slice(i, i + BATCH);
            const values = [];
            const placeholders = chunk.map((r, idx) => {
                const base = idx * 2;
                values.push(r.codigo, r.nome);
                return `($${base+1},$${base+2},NOW())`;
            });
            await client.query(`
                INSERT INTO balanco_despesas (codigo_des, nome_des, sincronizado_em)
                VALUES ${placeholders.join(',')}
            `, values);
            total += chunk.length;
            process.stdout.write(`\r⏳ ${total}/${records.length} inseridos...`);
        }

        await client.query('COMMIT');
        console.log(`\n✅ ${total} despesas sincronizadas com sucesso`);
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
