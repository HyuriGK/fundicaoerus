const pool = require('../../lib/db');
const { Firebird, options: firebirdOptions } = require('../../lib/firebird-helper');

function sanitize(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\0/g, '').trim();
}

function getMaterial(db, produtoCodigo) {
    return new Promise((resolve) => {
        db.query(`
            SELECT FIRST 1 M.MATERIAL_MAT
            FROM PRODUTO_MATERIAL PM
            JOIN MATERIAL M ON M.ID_MAT = PM.MAT_ID_PMT
            WHERE PM.PRODUTO_PMT = ?
        `, [produtoCodigo], (err, rows) => {
            if (err || !rows || rows.length === 0) return resolve(null);
            resolve(rows[0].MATERIAL_MAT || null);
        });
    });
}

async function syncFichasFusao() {
    console.log('🚀 Sincronização de Fichas Técnicas de Fusão...');

    // Garante colunas extras na tabela
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS peso_liquido NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS peso_bruto NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS peso_penca NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS peso_com_alimentacao NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS rendimento_metalico NUMERIC`);

    Firebird.attach(firebirdOptions, function (err, db) {
        if (err) { console.error('Erro Firebird:', err); process.exit(1); }

        // Mesmos critérios da ficha de moldagem: EMP_CODIGO_FIC = 10 AND ATIVO_FIC = 'S'
        const sql = `
            SELECT
                F.PRO_CODIGO_FIC,
                F.CLI_CODIGO_FIC,
                F.RENDIMENTO_METALICO_FIC,
                F.PESO_PENCA_FIC,
                F.PESO_UNITARIO_COM_ALIMENT_FIC,
                F.DATA_FIC,
                P.NOME_PRO,
                P.PESO_LIQUIDO_PRO,
                P.PESO_BRUTO_PRO,
                C.RAZAO_SOCIAL_CLI as NOME_CLIENTE
            FROM FICHA_TECNICA F
            LEFT JOIN PRODUTO P ON P.CODIGO_PRO = F.PRO_CODIGO_FIC
            LEFT JOIN CLIENTE C ON C.CODIGO_CLI = F.CLI_CODIGO_FIC
            WHERE F.EMP_CODIGO_FIC = 10 AND F.ATIVO_FIC = 'S'
        `;

        console.log('📥 Consultando Firebird...');
        db.query(sql, async function (err, results) {
            if (err) { console.error('Erro query:', err); db.detach(); process.exit(1); }

            console.log(`📊 ${results.length} registros recebidos.`);

            let count = 0;
            for (const row of results) {
                try {
                    const material = await getMaterial(db, row.PRO_CODIGO_FIC);

                    await pool.query(`
                        INSERT INTO ficha_tecnica_fusao (
                            pro_codigo, nome_pro, cliente_nome, cli_codigo, material,
                            peso_liquido, peso_bruto, peso_penca, peso_com_alimentacao,
                            rendimento_metalico, data_ficha, updated_at
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
                        ON CONFLICT (pro_codigo) DO UPDATE SET
                            nome_pro = EXCLUDED.nome_pro,
                            cliente_nome = EXCLUDED.cliente_nome,
                            cli_codigo = EXCLUDED.cli_codigo,
                            material = COALESCE(EXCLUDED.material, ficha_tecnica_fusao.material),
                            peso_liquido = EXCLUDED.peso_liquido,
                            peso_bruto = EXCLUDED.peso_bruto,
                            peso_penca = EXCLUDED.peso_penca,
                            peso_com_alimentacao = EXCLUDED.peso_com_alimentacao,
                            rendimento_metalico = EXCLUDED.rendimento_metalico,
                            data_ficha = EXCLUDED.data_ficha,
                            updated_at = NOW()
                    `, [
                        sanitize(row.PRO_CODIGO_FIC),
                        sanitize(row.NOME_PRO),
                        sanitize(row.NOME_CLIENTE),
                        sanitize(row.CLI_CODIGO_FIC),
                        sanitize(material),
                        row.PESO_LIQUIDO_PRO,
                        row.PESO_BRUTO_PRO,
                        row.PESO_PENCA_FIC,
                        row.PESO_UNITARIO_COM_ALIMENT_FIC,
                        row.RENDIMENTO_METALICO_FIC,
                        row.DATA_FIC || null
                    ]);
                    count++;
                    if (count % 50 === 0) console.log(`⏳ ${count}/${results.length}...`);
                } catch (e) {
                    console.error(`Erro em ${row.PRO_CODIGO_FIC}:`, e.message);
                }
            }

            console.log(`✅ Sincronização de fusão concluída: ${count} registros.`);
            db.detach();
            process.exit(0);
        });
    });
}

syncFichasFusao();
