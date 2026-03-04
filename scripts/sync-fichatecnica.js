const Firebird = require('node-firebird');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Firebird Config
const firebirdOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

// Postgres Config
function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

const pgPool = new Pool({
    connectionString: cleanConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false }
});

async function syncFichas() {
    console.log('🚀 Iniciando sincronização de Fichas Técnicas...');

    // 1. Criar tabela no Postgres
    const client = await pgPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS ficha_tecnica (
                pro_codigo_fic VARCHAR(50) PRIMARY KEY,
                nome_fic VARCHAR(255),
                material_fic VARCHAR(255),
                peso_liquido_fic DECIMAL(15,3),
                peso_bruto_fic DECIMAL(15,3),
                tipo_moldagem_desc_fic VARCHAR(100),
                operacao_moldagem_desc_fic VARCHAR(100),
                desenho_int_data_rev_fic DATE,
                descricao_fic TEXT,
                nome_pro VARCHAR(255),
                peso_liquido_pro DECIMAL(15,3),
                peso_bruto_pro DECIMAL(15,3),
                unidade_pro VARCHAR(10),
                ncm_pro VARCHAR(50),
                situacao_pro VARCHAR(10),
                nome_material VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabela ficha_tecnica verificada no Postgres.');
    } catch (e) {
        console.error('❌ Erro ao criar tabela no Postgres:', e);
        client.release();
        return;
    }

    // 2. Buscar dados no Firebird
    Firebird.attach(firebirdOptions, function (err, db) {
        if (err) {
            console.error('❌ Erro ao conectar no Firebird:', err);
            client.release();
            return;
        }

        const sql = `
            SELECT 
                F.PRO_CODIGO_FIC,
                F.MAT_NOMENCLATURA_FIC,
                F.PESO_LIQUIDO_FIC,
                F.PESO_UNIT_PCP_FIC,
                F.TIPO_MOLDAGEM_DESC_FIC,
                F.OPERACAO_MOLDAGEM_DESC_FIC,
                F.DESENHO_INT_DATA_REV_FIC,
                F.DESCRICAO_FIC,
                P.NOME_PRO,
                P.PESO_LIQUIDO_PRO,
                P.PESO_BRUTO_PRO,
                P.UNIDADE_PRO,
                P.NCM_PRO,
                P.SITUACAO_PRO,
                M.MATERIAL_MAT as NOME_MATERIAL
            FROM FICHA_TECNICA F
            LEFT JOIN PRODUTO P ON P.CODIGO_PRO = F.PRO_CODIGO_FIC
            LEFT JOIN PRODUTO_MATERIAL PM ON PM.PRODUTO_PMT = P.CODIGO_PRO
            LEFT JOIN MATERIAL M ON M.ID_MAT = PM.MAT_ID_PMT
        `;

        console.log('📥 Buscando dados no Firebird...');
        db.query(sql, async function (err, results) {
            if (err) {
                console.error('❌ Erro na query Firebird:', err);
                db.detach();
                client.release();
                return;
            }

            console.log(`📊 ${results.length} fichas encontradas. Iniciando upsert...`);

            let count = 0;
            for (const row of results) {
                try {
                    await client.query(`
                        INSERT INTO ficha_tecnica (
                            pro_codigo_fic, material_fic, peso_liquido_fic, peso_bruto_fic,
                            tipo_moldagem_desc_fic, operacao_moldagem_desc_fic, desenho_int_data_rev_fic,
                            descricao_fic, nome_pro, peso_liquido_pro, peso_bruto_pro, unidade_pro,
                            ncm_pro, situacao_pro, nome_material, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
                        ON CONFLICT (pro_codigo_fic) DO UPDATE SET
                            material_fic = EXCLUDED.material_fic,
                            peso_liquido_fic = EXCLUDED.peso_liquido_fic,
                            peso_bruto_fic = EXCLUDED.peso_bruto_fic,
                            tipo_moldagem_desc_fic = EXCLUDED.tipo_moldagem_desc_fic,
                            operacao_moldagem_desc_fic = EXCLUDED.operacao_moldagem_desc_fic,
                            desenho_int_data_rev_fic = EXCLUDED.desenho_int_data_rev_fic,
                            descricao_fic = EXCLUDED.descricao_fic,
                            nome_pro = EXCLUDED.nome_pro,
                            peso_liquido_pro = EXCLUDED.peso_liquido_pro,
                            peso_bruto_pro = EXCLUDED.peso_bruto_pro,
                            unidade_pro = EXCLUDED.unidade_pro,
                            ncm_pro = EXCLUDED.ncm_pro,
                            situacao_pro = EXCLUDED.situacao_pro,
                            nome_material = EXCLUDED.nome_material,
                            updated_at = NOW();
                    `, [
                        String(row.PRO_CODIGO_FIC).trim(),
                        row.MAT_NOMENCLATURA_FIC,
                        row.PESO_LIQUIDO_FIC,
                        row.PESO_UNIT_PCP_FIC,
                        row.TIPO_MOLDAGEM_DESC_FIC,
                        row.OPERACAO_MOLDAGEM_DESC_FIC,
                        row.DESENHO_INT_DATA_REV_FIC,
                        row.DESCRICAO_FIC,
                        row.NOME_PRO,
                        row.PESO_LIQUIDO_PRO,
                        row.PESO_BRUTO_PRO,
                        row.UNIDADE_PRO,
                        row.NCM_PRO,
                        row.SITUACAO_PRO,
                        row.NOME_MATERIAL
                    ]);
                    count++;
                    if (count % 100 === 0) process.stdout.write('.');
                } catch (e) {
                    console.error(`\n❌ Erro ao inserir item ${row.PRO_CODIGO_FIC}:`, e.message);
                }
            }

            console.log(`\n\n✅ Sincronização concluída! ${count} registros processados.`);
            db.detach();
            client.release();
            await pgPool.end();
        });
    });
}

syncFichas();
