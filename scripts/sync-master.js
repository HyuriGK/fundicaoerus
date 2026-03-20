const Firebird = require('node-firebird');
const pool = require('../lib/db');
require('dotenv').config({ path: '.env.local' });

/**
 * MASTER SYNC (SIMPLIFICADA)
 * Foco: Apenas Roteiros Produtivos (Etapas) para as OPs em aberto.
 * Firebird: Apenas Consulta (Read-Only).
 */

const firebirdOptions = {
    host: '10.1.1.100', port: 3050, database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, pageSize: 4096
};

async function syncMaster() {
    const startTime = Date.now();
    console.log('\n======================================================');
    console.log('🚀 INICIANDO SINCRONIZAÇÃO MASTER (ROTEIROS)');
    console.log('======================================================\n');

    try {
        // 1. Buscar produtos das OPs em aberto na Carteira (Postgres)
        console.log('🔍 [1/4] Identificando produtos ativos na Carteira...');
        const carteiraRes = await pool.query('SELECT DISTINCT codigo FROM carteira WHERE codigo IS NOT NULL');
        const activeProducts = carteiraRes.rows.map(r => String(r.codigo).trim());

        if (activeProducts.length === 0) {
            console.log('⚠️ [Aviso] Nenhuma OP em aberto encontrada na carteira. Nada para sincronizar.');
            process.exit(0);
        }
        console.log(`📦 [Status] ${activeProducts.length} produtos ativos encontrados.`);

        // 2. Conectar ao Firebird
        console.log('🔄 [2/4] Consultando Firebird (Conexão Segura)...');
        Firebird.attach(firebirdOptions, async function (err, db) {
            if (err) { console.error('❌ [Erro] Falha ao conectar no Firebird:', err.message); process.exit(1); }

            const placeholders = activeProducts.map(c => `'${c}'`).join(',');
            
            // Query 1: Vínculos de OP -> Ficha
            // Filtramos apenas os produtos que estão na nossa carteira
            console.log('📥 [3/4] Coletando vínculos de OP e Etapas Produtivas...');
            db.query(`
                SELECT CODIGO_PCP, FIC_CODIGO_PCP 
                FROM PRODUCAO 
                WHERE FIC_CODIGO_PCP IS NOT NULL 
                AND PRODUTO_PCP IN (${placeholders})
                AND STATUS_PCP <> 'C'
            `, async (err, ops) => {
                if (err) console.error('⚠️ [Aviso] Erro na query de OPs:', err.message);

                if (!err && ops && ops.length > 0) {
                    const pgClient = await pool.connect();
                    try {
                        await pgClient.query('BEGIN');
                        for (let i = 0; i < ops.length; i += 500) {
                            const chunk = ops.slice(i, i + 500);
                            const valStr = chunk.map((op, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(',');
                            const params = chunk.flatMap(op => [String(op.CODIGO_PCP).trim(), op.FIC_CODIGO_PCP]);
                            await pgClient.query(`INSERT INTO producao_fichas (op_codigo, ficha_id) VALUES ${valStr} ON CONFLICT (op_codigo) DO UPDATE SET ficha_id = EXCLUDED.ficha_id`, params);
                        }
                        await pgClient.query('COMMIT');
                        console.log(`✅ [Vínculos] ${ops.length} OPs sincronizadas.`);
                    } catch (e) { await pgClient.query('ROLLBACK'); }
                    finally { pgClient.release(); }
                }

                // Query 2: Etapas do Roteiro (Procedimentos)
                db.query(`
                    SELECT FT.CODIGO_FIC, PS.SEQUENCIA_PDS as SEQUENCIA, S.NOME_SET as SETOR
                    FROM FICHA_TECNICA FT
                    JOIN PROCEDIMENTO P ON P.CODIGO_PDT = FT.PDT_CODIGO_FIC
                    JOIN PROCEDIMENTO_SETOR PS ON PS.PDT_CODIGO_PDS = P.CODIGO_PDT
                    JOIN SETOR S ON S.CODIGO_SET = PS.SET_CODIGO_PDS
                    WHERE FT.ATIVO_FIC = 'S' AND PS.SET_EMPRESA_PDS = 10 AND S.NOME_SET NOT LIKE 'NAO USAR%'
                    AND FT.PRO_CODIGO_FIC IN (${placeholders})
                `, async (err, rts) => {
                    if (err) console.error('⚠️ [Aviso] Erro na query de roteiros:', err.message);

                    if (!err && rts && rts.length > 0) {
                        const pgClient = await pool.connect();
                        try {
                            await pgClient.query('BEGIN');
                            // Salva as etapas no Postgres
                            for (let i = 0; i < rts.length; i += 300) {
                                const chunk = rts.slice(i, i + 300);
                                const valStr = chunk.map((rt, idx) => `($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`).join(',');
                                const params = chunk.flatMap(rt => [rt.CODIGO_FIC, rt.SEQUENCIA, String(rt.SETOR).trim().toUpperCase()]);
                                await pgClient.query(`INSERT INTO roteiros_tecnicos (ficha_id, sequencia, setor_nome) VALUES ${valStr} ON CONFLICT (ficha_id, sequencia) DO UPDATE SET setor_nome = EXCLUDED.setor_nome`, params);
                            }
                            await pgClient.query('COMMIT');
                            console.log(`✅ [Roteiros] ${rts.length} etapas sincronizadas.`);
                        } catch (e) { await pgClient.query('ROLLBACK'); }
                        finally { pgClient.release(); }
                    } else {
                        console.log('⚠️ [Aviso] Nenhum roteiro encontrado para os produtos ativos.');
                    }

                    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log('\n======================================================');
                    console.log(`🎉 SINCRONIZAÇÃO CONCLUÍDA EM ${duration}S!`);
                    console.log('======================================================\n');
                    db.detach();
                    process.exit(0);
                });
            });
        });

    } catch (e) {
        console.error('❌ [Erro Crítico]:', e.message);
        process.exit(1);
    }
}

syncMaster();
