const Firebird = require('node-firebird');
const pool = require('../lib/db');
require('dotenv').config({ path: '.env.local' });

const firebirdOptions = {
    host: '10.1.1.100', port: 3050, database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, pageSize: 4096
};

async function syncRoteiros() {
    console.log('🚀 Iniciando sincronização de Roteiros (Firebird -> Postgres)...');

    try {
        // 1. Criar tabelas no Postgres
        await pool.query(`
            CREATE TABLE IF NOT EXISTS roteiros_tecnicos (
                ficha_id INTEGER,
                sequencia INTEGER,
                setor_nome VARCHAR(255),
                PRIMARY KEY (ficha_id, sequencia)
            );
            
            CREATE TABLE IF NOT EXISTS producao_fichas (
                op_codigo VARCHAR(50) PRIMARY KEY,
                ficha_id INTEGER
            );
        `);
        console.log('✅ Tabelas no Postgres prontas.');

        Firebird.attach(firebirdOptions, async function (err, db) {
            if (err) {
                console.error('❌ Erro Firebird:', err.message);
                return;
            }

            // 2. Sincronizar Vínculo OP -> Ficha
            console.log('📥 Buscando vínculos OP -> Ficha...');
            db.query(`
                SELECT CODIGO_PCP, FIC_CODIGO_PCP 
                FROM PRODUCAO 
                WHERE FIC_CODIGO_PCP IS NOT NULL AND STATUS_PCP <> 'C'
                AND DATA_PCP > '2025-01-01'
            `, async (err, ops) => {
                if (err) console.error('Erro query PRODUCAO:', err);
                else {
                    console.log(`📊 Sincronizando ${ops.length} vínculos de OP...`);
                    for (const op of ops) {
                        await pool.query(`
                            INSERT INTO producao_fichas (op_codigo, ficha_id)
                            VALUES ($1, $2)
                            ON CONFLICT (op_codigo) DO UPDATE SET ficha_id = EXCLUDED.ficha_id
                        `, [String(op.CODIGO_PCP).trim(), op.FIC_CODIGO_PCP]);
                    }
                }

                // 3. Sincronizar Roteiros (Ficha -> Setores)
                console.log('📥 Buscando Roteiros (Ficha Técnica -> Procedimentos)...');
                db.query(`
                    SELECT 
                        FT.CODIGO_FIC,
                        PS.SEQUENCIA_PDS as SEQUENCIA, 
                        S.NOME_SET as SETOR
                    FROM FICHA_TECNICA FT
                    JOIN PROCEDIMENTO P ON P.CODIGO_PDT = FT.PDT_CODIGO_FIC
                    JOIN PROCEDIMENTO_SETOR PS ON PS.PDT_CODIGO_PDS = P.CODIGO_PDT
                    JOIN SETOR S ON S.CODIGO_SET = PS.SET_CODIGO_PDS
                    WHERE FT.ATIVO_FIC = 'S'
                      AND PS.SET_EMPRESA_PDS = 10
                      AND S.NOME_SET NOT LIKE 'NAO USAR%'
                    ORDER BY FT.CODIGO_FIC, PS.SEQUENCIA_PDS
                `, async (err, rts) => {
                    if (err) console.error('Erro query ROTEIROS:', err);
                    else {
                        console.log(`📊 Sincronizando ${rts.length} etapas de roteiros...`);
                        
                        // Limpar roteiros antigos para garantir integridade
                        await pool.query('DELETE FROM roteiros_tecnicos');

                        for (const rt of rts) {
                            await pool.query(`
                                INSERT INTO roteiros_tecnicos (ficha_id, sequencia, setor_nome)
                                VALUES ($1, $2, $3)
                                ON CONFLICT (ficha_id, sequencia) DO UPDATE SET setor_nome = EXCLUDED.setor_nome
                            `, [rt.CODIGO_FIC, rt.SEQUENCIA, String(rt.SETOR).trim().toUpperCase()]);
                        }
                    }

                    console.log('✅ Sincronização concluída!');
                    db.detach();
                    process.exit(0);
                });
            });
        });

    } catch (e) {
        console.error('❌ Erro fatal na sincronização:', e.message);
        process.exit(1);
    }
}

syncRoteiros();
