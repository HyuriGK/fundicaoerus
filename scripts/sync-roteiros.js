const Firebird = require('node-firebird');
const pool = require('../lib/db');
require('dotenv').config({ path: '.env.local' });

const firebirdOptions = {
    host: '10.1.1.100', port: 3050, database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, pageSize: 4096
};

async function syncRoteiros() {
    const startTime = Date.now();
    console.log('🚀 Iniciando sincronização FOCADA de Roteiros...');

    try {
        // 1. Get active products from Postgres Carteira
        console.log('🔍 Buscando produtos ativos na carteira (Postgres)...');
        const carteiraRes = await pool.query('SELECT DISTINCT codigo FROM carteira WHERE codigo IS NOT NULL');
        const activeProducts = carteiraRes.rows.map(r => String(r.codigo).trim());

        if (activeProducts.length === 0) {
            console.log('⚠️ Nenhuma OP ativa encontrada na carteira. Nada para sincronizar.');
            process.exit(0);
        }

        Firebird.attach(firebirdOptions, async function (err, db) {
            if (err) { console.error('Erros Firebird:', err.message); process.exit(1); }

            // 1. Sync OP -> Ficha for active products
            const placeholders = activeProducts.map(c => `'${c}'`).join(',');
            db.query(`
                SELECT CODIGO_PCP, FIC_CODIGO_PCP 
                FROM PRODUCAO 
                WHERE FIC_CODIGO_PCP IS NOT NULL 
                AND PRO_CODIGO_PCP IN (${placeholders})
                AND STATUS_PCP <> 'C'
            `, async (err, ops) => {
                if (!err && ops.length > 0) {
                    console.log(`📥 Sincronizando ${ops.length} vínculos de OPs ativas...`);
                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        for (let i = 0; i < ops.length; i += 500) {
                            const chunk = ops.slice(i, i + 500);
                            const valStr = chunk.map((op, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(',');
                            const params = chunk.flatMap(op => [String(op.CODIGO_PCP).trim(), op.FIC_CODIGO_PCP]);
                            await client.query(`INSERT INTO producao_fichas (op_codigo, ficha_id) VALUES ${valStr} ON CONFLICT (op_codigo) DO UPDATE SET ficha_id = EXCLUDED.ficha_id`, params);
                        }
                        await client.query('COMMIT');
                    } catch (e) { await client.query('ROLLBACK'); console.error('Erro batch OPs:', e.message); }
                    finally { client.release(); }
                }

                // 2. Sync Routes focused on these products
                db.query(`
                    SELECT FT.CODIGO_FIC, PS.SEQUENCIA_PDS as SEQUENCIA, S.NOME_SET as SETOR
                    FROM FICHA_TECNICA FT
                    JOIN PROCEDIMENTO P ON P.CODIGO_PDT = FT.PDT_CODIGO_FIC
                    JOIN PROCEDIMENTO_SETOR PS ON PS.PDT_CODIGO_PDS = P.CODIGO_PDT
                    JOIN SETOR S ON S.CODIGO_SET = PS.SET_CODIGO_PDS
                    WHERE FT.ATIVO_FIC = 'S' AND PS.SET_EMPRESA_PDS = 10 AND S.NOME_SET NOT LIKE 'NAO USAR%'
                    AND FT.PRO_CODIGO_FIC IN (${placeholders})
                `, async (err, rts) => {
                    if (!err && rts.length > 0) {
                        console.log(`📥 Sincronizando ${rts.length} etapas de roteiros focados...`);
                        const client = await pool.connect();
                        try {
                            await client.query('BEGIN');
                            // We don't delete all anymore, just update/insert to preserve others or handle by ficha_id
                            for (let i = 0; i < rts.length; i += 300) {
                                const chunk = rts.slice(i, i + 300);
                                const valStr = chunk.map((rt, idx) => `($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`).join(',');
                                const params = chunk.flatMap(rt => [rt.CODIGO_FIC, rt.SEQUENCIA, String(rt.SETOR).trim().toUpperCase()]);
                                await client.query(`INSERT INTO roteiros_tecnicos (ficha_id, sequencia, setor_nome) VALUES ${valStr} ON CONFLICT (ficha_id, sequencia) DO UPDATE SET setor_nome = EXCLUDED.setor_nome`, params);
                            }
                            await client.query('COMMIT');
                        } catch (e) { await client.query('ROLLBACK'); console.error('Erro batch Roteiros:', e.message); }
                        finally { client.release(); }
                    }

                    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log(`✅ Sincronização FOCADA de roteiros concluída em ${duration}s!`);
                    db.detach();
                    process.exit(0);
                });
            });
        });
    } catch (e) { console.error('❌ Erro fatal:', e.message); process.exit(1); }
}

syncRoteiros();
