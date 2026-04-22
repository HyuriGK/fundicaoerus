const pool = require('../../lib/db');
const { Firebird, options: firebirdOptions } = require('../../lib/firebird-helper');

function sanitize(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\0/g, '').trim();
}

function readBlob(blob) {
    return new Promise((resolve) => {
        if (!blob) return resolve('');
        if (typeof blob !== 'function') return resolve(String(blob));
        blob((err, name, stream) => {
            if (err) return resolve('');
            let chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            stream.on('error', () => resolve(''));
        });
    });
}

function getObsVazamento(db, proCodigo) {
    return new Promise((resolve) => {
        db.query('SELECT FIRST 1 FUNDICAO_OBS_FIC FROM FICHA_TECNICA WHERE PRO_CODIGO_FIC = ? AND EMP_CODIGO_FIC = 10 AND ATIVO_FIC = ?', [proCodigo, 'S'], async (err, rows) => {
            if (err || !rows || rows.length === 0) return resolve('');
            resolve(await readBlob(rows[0].FUNDICAO_OBS_FIC));
        });
    });
}

// Elementos químicos presentes na tabela PRODUTO_MATERIAL
const ELEMENTOS = ['C','SI','MN','P','S','CR','NI','MO','AL','V','CU','MG','W','B','CO','TI','NB','PB','SN','ZN','AS','BI','CA','CE','ZR','LA','FE'];

function getMaterialInfo(db, produtoCodigo) {
    return new Promise((resolve) => {
        const cols = ELEMENTOS.map(e => `PM.${e}_MIN_PMT, PM.${e}_MAX_PMT`).join(', ');
        db.query(`
            SELECT FIRST 1 M.MATERIAL_MAT, PM.MAT_ID_PMT, ${cols},
                M.CONTRACAO_MAT, M.LIMITE_RESISTENCIA_MAT, M.LIMITE_ESCOAMENTO_MAT,
                M.ALONGAMENTO_MAT, M.ESTRICCAO_MAT, M.REDUCAO_AREA_MAT,
                M.IMPACTO_TESTE_CHARPY_MAT, M.HB_MAX_MAT, M.HB_MAT
            FROM PRODUTO_MATERIAL PM
            JOIN MATERIAL M ON M.ID_MAT = PM.MAT_ID_PMT
            WHERE PM.PRODUTO_PMT = ?
        `, [produtoCodigo], (err, rows) => {
            if (err || !rows || rows.length === 0) return resolve({ material: null, mat_id: null, composicao: [], props: {} });
            const row = rows[0];
            const composicao = [];
            for (const el of ELEMENTOS) {
                const min = parseFloat(row[`${el}_MIN_PMT`]) || 0;
                const max = parseFloat(row[`${el}_MAX_PMT`]) || 0;
                if (min === 0 && max === 0) continue;
                composicao.push({ elemento: el, min, max });
            }
            resolve({
                material: row.MATERIAL_MAT || null,
                mat_id: row.MAT_ID_PMT || null,
                composicao: JSON.stringify(composicao),
                contracao: row.CONTRACAO_MAT || null,
                limite_resistencia: row.LIMITE_RESISTENCIA_MAT || null,
                limite_escoamento: row.LIMITE_ESCOAMENTO_MAT || null,
                alongamento: row.ALONGAMENTO_MAT || null,
                estriccao: row.ESTRICCAO_MAT || null,
                reducao_area: row.REDUCAO_AREA_MAT || null,
                impacto_charpy: row.IMPACTO_TESTE_CHARPY_MAT || null,
                hb_max: row.HB_MAX_MAT || null,
                hb_mat: row.HB_MAT || null
            });
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
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS temperatura_forno NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS temperatura_vazamento NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS obs_vazamento TEXT`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS fornecimento TEXT`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS foto_base64 TEXT`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS relacao_metal_molde NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS relacao_molde_metal NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS mat_id TEXT`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS composicao_quimica JSONB`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS contracao_mat NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS limite_resistencia_mat NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS limite_escoamento_mat NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS alongamento_mat NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS estriccao_mat NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS reducao_area_mat NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS impacto_teste_charpy_mat NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS hb_max_mat NUMERIC`);
    await pool.query(`ALTER TABLE ficha_tecnica_fusao ADD COLUMN IF NOT EXISTS hb_mat NUMERIC`);

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
                F.TEMPERATURA_FORNO_FIC,
                F.TEMPERATURA_VAZAMENTO_FIC,
                F.FORNECIMENTO_FIC,
                F.RELACAO_METAL_MOLDE_FIC,
                F.RELACAO_MOLDE_METAL_FIC,
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

            // Busca todas as fotos já sincronizadas na ficha de moldagem (Postgres)
            const fotosResult = await pool.query('SELECT pro_codigo_fic, foto_base64 FROM ficha_tecnica WHERE foto_base64 IS NOT NULL');
            const fotosMap = {};
            fotosResult.rows.forEach(r => { fotosMap[String(r.pro_codigo_fic).trim()] = r.foto_base64; });

            const fornMap = { 'BT': 'BRUTO', 'PU': 'PRÉ-USINADO', 'US': 'USINADO', 'FJ': 'FORJADO', 'FB': 'FABRICADO' };

            let count = 0;
            for (const row of results) {
                try {
                    const matInfo = await getMaterialInfo(db, row.PRO_CODIGO_FIC);
                    const obsVazamento = await getObsVazamento(db, row.PRO_CODIGO_FIC);
                    const codigo = sanitize(row.PRO_CODIGO_FIC);
                    const foto = fotosMap[codigo] || null;
                    const fornecimento = fornMap[String(row.FORNECIMENTO_FIC || '').trim()] || row.FORNECIMENTO_FIC || null;

                    await pool.query(`
                        INSERT INTO ficha_tecnica_fusao (
                            pro_codigo, nome_pro, cliente_nome, cli_codigo, material, mat_id,
                            peso_liquido, peso_bruto, peso_penca, peso_com_alimentacao,
                            rendimento_metalico, temperatura_forno, temperatura_vazamento,
                            obs_vazamento, fornecimento, foto_base64,
                            relacao_metal_molde, relacao_molde_metal,
                            composicao_quimica,
                            contracao_mat, limite_resistencia_mat, limite_escoamento_mat,
                            alongamento_mat, estriccao_mat, reducao_area_mat,
                            impacto_teste_charpy_mat, hb_max_mat, hb_mat,
                            data_ficha, updated_at
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,NOW())
                        ON CONFLICT (pro_codigo) DO UPDATE SET
                            nome_pro = EXCLUDED.nome_pro,
                            cliente_nome = EXCLUDED.cliente_nome,
                            cli_codigo = EXCLUDED.cli_codigo,
                            material = COALESCE(EXCLUDED.material, ficha_tecnica_fusao.material),
                            mat_id = EXCLUDED.mat_id,
                            peso_liquido = EXCLUDED.peso_liquido,
                            peso_bruto = EXCLUDED.peso_bruto,
                            peso_penca = EXCLUDED.peso_penca,
                            peso_com_alimentacao = EXCLUDED.peso_com_alimentacao,
                            rendimento_metalico = EXCLUDED.rendimento_metalico,
                            temperatura_forno = EXCLUDED.temperatura_forno,
                            temperatura_vazamento = EXCLUDED.temperatura_vazamento,
                            obs_vazamento = EXCLUDED.obs_vazamento,
                            fornecimento = EXCLUDED.fornecimento,
                            foto_base64 = EXCLUDED.foto_base64,
                            relacao_metal_molde = EXCLUDED.relacao_metal_molde,
                            relacao_molde_metal = EXCLUDED.relacao_molde_metal,
                            composicao_quimica = EXCLUDED.composicao_quimica,
                            contracao_mat = EXCLUDED.contracao_mat,
                            limite_resistencia_mat = EXCLUDED.limite_resistencia_mat,
                            limite_escoamento_mat = EXCLUDED.limite_escoamento_mat,
                            alongamento_mat = EXCLUDED.alongamento_mat,
                            estriccao_mat = EXCLUDED.estriccao_mat,
                            reducao_area_mat = EXCLUDED.reducao_area_mat,
                            impacto_teste_charpy_mat = EXCLUDED.impacto_teste_charpy_mat,
                            hb_max_mat = EXCLUDED.hb_max_mat,
                            hb_mat = EXCLUDED.hb_mat,
                            data_ficha = EXCLUDED.data_ficha,
                            updated_at = NOW()
                    `, [
                        codigo,
                        sanitize(row.NOME_PRO),
                        sanitize(row.NOME_CLIENTE),
                        sanitize(row.CLI_CODIGO_FIC),
                        sanitize(matInfo.material),
                        sanitize(String(matInfo.mat_id || '')),
                        row.PESO_LIQUIDO_PRO,
                        row.PESO_BRUTO_PRO,
                        row.PESO_PENCA_FIC,
                        row.PESO_UNITARIO_COM_ALIMENT_FIC,
                        row.RENDIMENTO_METALICO_FIC,
                        row.TEMPERATURA_FORNO_FIC,
                        row.TEMPERATURA_VAZAMENTO_FIC,
                        sanitize(obsVazamento),
                        fornecimento,
                        foto,
                        row.RELACAO_METAL_MOLDE_FIC,
                        row.RELACAO_MOLDE_METAL_FIC,
                        matInfo.composicao,
                        matInfo.contracao,
                        matInfo.limite_resistencia,
                        matInfo.limite_escoamento,
                        matInfo.alongamento,
                        matInfo.estriccao,
                        matInfo.reducao_area,
                        matInfo.impacto_charpy,
                        matInfo.hb_max,
                        matInfo.hb_mat,
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
