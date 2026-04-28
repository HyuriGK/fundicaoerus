
const pool = require('../lib/db');

const { Firebird, options: firebirdOptions } = require('../lib/firebird-helper');

// Helper to strip NULL characters (\u0000) which Postgres rejects
function sanitize(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\0/g, '').trim();
}

// Helper to read Firebird BLOBs as Buffer (for images)
function readBlobBuffer(blob) {
    return new Promise((resolve) => {
        if (!blob) return resolve(null);
        if (typeof blob !== 'function') return resolve(null);
        blob((err, name, stream) => {
            if (err) return resolve(null);
            let chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', () => resolve(null));
        });
    });
}

// Helper to read Firebird BLOBs as String (for text)
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

function parseObservation(raw) {
    if (!raw) return '';
    try {
        let content = raw;
        // Remove grupos RTF com metadados: fonttbl, colortbl, stylesheet, info, etc.
        content = content.replace(/\{\\fonttbl[^}]*(\{[^}]*\})*[^}]*\}/gi, '');
        content = content.replace(/\{\\colortbl[^}]*\}/gi, '');
        content = content.replace(/\{\\stylesheet[^}]*(\{[^}]*\})*[^}]*\}/gi, '');
        content = content.replace(/\{\\info[^}]*(\{[^}]*\})*[^}]*\}/gi, '');
        content = content.replace(/\{\\[a-z]+[^}]*\}/gi, '');
        // Quebras de parágrafo RTF
        content = content.replace(/\\par\b/g, '\n');
        content = content.replace(/\\pard\b/g, '');
        // Remove todas as tags RTF restantes
        content = content.replace(/\\[a-z]+[0-9]*/gi, '');
        // Remove chaves
        content = content.replace(/[{}]/g, '');
        // Normaliza espaços
        content = content.replace(/[ \t]+/g, ' ');
        content = content.replace(/\n\s*\n/g, '\n');
        // Busca a partir de OBS: se existir
        const obsMatch = content.match(/OBS:/i);
        if (obsMatch) content = content.substring(obsMatch.index);
        return content.trim();
    } catch (e) {
        return raw;
    }
}

function getMachos(db, fichaCodigo) {
    return new Promise((resolve) => {
        db.query(`
            SELECT SEQUENCIA_FTCM, QUANTIDADE_CADA_FTCM, TIPO_MOLDAGEM_FTCM, PINTURA_FTCM 
            FROM FICHA_TECNICA_CAIXA_MACHO 
            WHERE FIC_CODIGO_FTCM = ?
            ORDER BY SEQUENCIA_FTCM
        `, [fichaCodigo], (err, results) => {
            if (err) return resolve([]);
            resolve(results);
        });
    });
}

function getFotosRelatorio(db, fichaCodigo) {
    return new Promise((resolve) => {
        db.query(`
            SELECT FOTO_FTT FROM FICHA_TECNICA_FOTO
            WHERE FIC_CODIGO_FTT = ? AND TRIM(EXIBIR_RELATORIO_FTT) = 'S'
        `, [fichaCodigo], async (err, results) => {
            if (err || !results || results.length === 0) return resolve([]);
            const fotos = [];
            for (const r of results) {
                const buf = await readBlobBuffer(r.FOTO_FTT);
                if (buf) fotos.push(buf.toString('base64'));
            }
            resolve(fotos);
        });
    });
}

function getLuvas(db, fichaCodigo) {
    return new Promise((resolve) => {
        db.query(`
            SELECT FIP.QUANTIDADE_FIP as QUANTIDADE_PCM, P.NOME_PRO as NOME_LUVA, FIP.FATOR_FIGURAS_FIP
            FROM FICHA_TECNICA_PRODUTO FIP
            LEFT JOIN PRODUTO P ON P.CODIGO_PRO = FIP.PRO_CODIGO_FIP
            WHERE FIP.FIC_CODIGO_FIP = ?
        `, [fichaCodigo], (err, results) => {
            if (err) return resolve([]);
            resolve(results);
        });
    });
}

// Fetch Material for a single product (avoids large join/subquery in main query)
function getMaterial(db, produtoCodigo) {
    return new Promise((resolve) => {
        db.query(`
            SELECT FIRST 1 M.MATERIAL_MAT, PM.LOTE_PMT
            FROM PRODUTO_MATERIAL PM
            JOIN MATERIAL M ON M.ID_MAT = PM.MAT_ID_PMT
            WHERE PM.PRODUTO_PMT = ?
        `, [produtoCodigo], (err, rows) => {
            if (err || !rows || rows.length === 0) return resolve({ material: null, lote: null });
            resolve({ material: rows[0].MATERIAL_MAT || null, lote: rows[0].LOTE_PMT || null });
        });
    });
}

// Fetch BLOBs for a single ficha via individual query (avoids invalidation)
function getBlobs(db, fichaCodigo) {
    return new Promise((resolve) => {
        db.query('SELECT MOLDAGEM_OBS_FIC, MINIATURA_FIC FROM FICHA_TECNICA WHERE CODIGO_FIC = ?', [fichaCodigo], async (err, rows) => {
            if (err || !rows || rows.length === 0) return resolve({ descricao: '', fotoBuffer: null });
            const r = rows[0];
            const obsRaw = await readBlob(r.MOLDAGEM_OBS_FIC);
            const fotoBuffer = await readBlobBuffer(r.MINIATURA_FIC);
            const descricao = obsRaw ? parseObservation(obsRaw) : '';
            resolve({ descricao, fotoBuffer });
        });
    });
}

async function syncFichas() {
    console.log('🚀 Sincronização de Fichas Técnicas (Garantindo preservação de dados)...');

    Firebird.attach(firebirdOptions, function (err, db) {
        if (err) { console.error('Erro Firebird:', err); return; }

        // Main query WITHOUT BLOBs (fetched per-row via getBlobs)
        const sql = `
            SELECT 
                F.CODIGO_FIC, F.PRO_CODIGO_FIC, F.MAT_NOMENCLATURA_FIC, F.PESO_LIQUIDO_FIC, F.PESO_UNIT_PCP_FIC,
                F.TIPO_MOLDAGEM_DESC_FIC, F.OPERACAO_MOLDAGEM_DESC_FIC,
                F.CLI_CODIGO_FIC, F.MODELO_FIC, F.CAVIDADE_PESO_BOLO_FIC,
                F.QTDE_CAIXAS_MACHO_FIC, F.PINTAR_PISTOLA_FIC, F.PINTAR_IMERSAO_FIC,
                F.FORNECIMENTO_FIC, F.PESO_PENCA_FIC, F.PESO_UNITARIO_COM_ALIMENT_FIC,
                F.PESO_UNITARIO_SEM_ALIMENT_FIC, F.RELACAO_MOLDE_METAL_FIC,
                F.PESO_TAMPA_FIC, F.PESO_FUNDO_FIC, F.CAVIDADE_QTDE_FIGURAS_FIC, F.TIPO_MODELO_FIC,
                F.PESO_MACHOS_FIC, F.DATA_FIC, F.TINTA_REFRATARIA_FIC, F.TIPO_FERRAMENTAL_FIC,
                P.NOME_PRO, P.PESO_LIQUIDO_PRO, P.PESO_BRUTO_PRO, P.SITUACAO_PRO, P.REFERENCIA_PRO,
                C.RAZAO_SOCIAL_CLI as NOME_CLIENTE
            FROM FICHA_TECNICA F
            LEFT JOIN PRODUTO P ON P.CODIGO_PRO = F.PRO_CODIGO_FIC
            LEFT JOIN CLIENTE C ON C.CODIGO_CLI = F.CLI_CODIGO_FIC
            WHERE F.EMP_CODIGO_FIC = 10 AND F.ATIVO_FIC = 'S'
        `;

        console.log('📥 Executando query no Firebird (sem BLOBs)...');
        db.query(sql, async function (err, results) {
            if (err) { console.error('Erro query:', err); db.detach(); return; }

            console.log(`📊 ${results.length} registros recebidos. Ordenando por data...`);

            // Sort in JS (much faster than Firebird without index)
            results.sort((a, b) => {
                const dataA = a.DATA_FIC ? new Date(a.DATA_FIC) : new Date(0);
                const dataB = b.DATA_FIC ? new Date(b.DATA_FIC) : new Date(0);
                return dataB - dataA;
            });

            console.log(`✅ Ordenação concluída. Iniciando loop de processamento...`);

            // Garantir coluna lote_pmt existe (uma vez antes do loop)
            await pool.query(`ALTER TABLE ficha_tecnica ADD COLUMN IF NOT EXISTS lote_pmt TEXT`);

            // Garantir tabela de fotos do relatório existe
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ficha_tecnica_fotos (
                    id SERIAL PRIMARY KEY,
                    pro_codigo_fic TEXT NOT NULL,
                    foto_base64 TEXT NOT NULL,
                    ordem INT NOT NULL DEFAULT 0,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_ficha_tecnica_fotos_pro ON ficha_tecnica_fotos(pro_codigo_fic)`);

            let count = 0;
            for (const row of results) {
                try {
                    const pintura = String(row.PINTAR_PISTOLA_FIC).trim() === 'S' ? 'PISTOLA' : (String(row.PINTAR_IMERSAO_FIC).trim() === 'S' ? 'IMERSAO' : '-');
                    const fornMap = { 'BT': 'BRUTO', 'PU': 'PRÉ-USINADO', 'US': 'USINADO', 'FJ': 'FORJADO', 'FB': 'FABRICADO' };
                    const fornecimento = fornMap[String(row.FORNECIMENTO_FIC).trim()] || row.FORNECIMENTO_FIC || '-';
                    const modelMap = { 0: 'MODELO EM CAIXA', 1: 'MODELO EM PLACA', 2: 'MODELO SOLTO' };
                    const tipoModelo = modelMap[row.TIPO_MODELO_FIC] || '-';
                    const relacao = row.RELACAO_MOLDE_METAL_FIC || 0;

                    // Fetch BLOBs individually (separate query per row - avoids invalidation)
                    const blobs = await getBlobs(db, row.CODIGO_FIC);
                    const descricao = blobs.descricao || '';
                    const fotoBase64 = blobs.fotoBuffer ? blobs.fotoBuffer.toString('base64') : null;

                    // Fetch Material + Lote
                    const { material: materialReal, lote: loteReal } = await getMaterial(db, row.PRO_CODIGO_FIC);

                    // Fetch Machos
                    const machosList = await getMachos(db, row.CODIGO_FIC);
                    const pinturaMachoMap = { 'N': 'NÃO SE APLICA', 'L': 'LAVAGEM', 'P': 'PINCEL', 'S': 'PISTOLA', 'I': 'IMERSÃO' };
                    const tipoMachoMap = { '5': 'PEPSET', '0': 'CURA FRIO' };
                    const mapMulti = (str, map) => {
                        if (!str) return '-';
                        return String(str).split(/[;,]/).map(p => p.trim()).filter(p => p !== '').map(p => map[p] || p).join(' / ') || '-';
                    };
                    const detalhesMachos = machosList.map(m => {
                        const pMacho = mapMulti(m.PINTURA_FTCM, pinturaMachoMap);
                        const tMacho = mapMulti(m.TIPO_MOLDAGEM_FTCM, tipoMachoMap);
                        return `MACHO ${m.SEQUENCIA_FTCM} - QTDE: ${m.QUANTIDADE_CADA_FTCM} - TIPO: ${tMacho} - PINTURA: ${pMacho}`;
                    }).join('\n');

                    // Fetch Luvas
                    const luvasList = await getLuvas(db, row.CODIGO_FIC);
                    const detalhesLuvas = luvasList.map(l => {
                        let finalQuant = l.QUANTIDADE_PCM || 0;
                        const fator = parseInt(l.FATOR_FIGURAS_FIP) || 0;
                        const figuras = parseFloat(row.CAVIDADE_QTDE_FIGURAS_FIC) || 1;

                        if (fator === 1 && figuras > 0) {
                            finalQuant = finalQuant / figuras;
                        } else if (fator === 2) {
                            finalQuant = finalQuant * figuras;
                        }

                        // Format to 3 decimal places to keep it precise
                        const qStr = parseFloat(finalQuant.toFixed(3));
                        return `LUVA: ${l.NOME_LUVA || '-'} - QTDE: ${qStr}`;
                    }).join('\n');

                    // Fetch Fotos do Relatório
                    const fotosRelatorio = await getFotosRelatorio(db, row.CODIGO_FIC);
                    if (fotosRelatorio.length > 0) console.log(`📸 Ficha ${row.CODIGO_FIC} (${row.PRO_CODIGO_FIC}): ${fotosRelatorio.length} foto(s) encontrada(s)`);
                    if (fotosRelatorio.length > 0) {
                        await pool.query(`DELETE FROM ficha_tecnica_fotos WHERE pro_codigo_fic = $1`, [sanitize(row.PRO_CODIGO_FIC)]);
                        for (let i = 0; i < fotosRelatorio.length; i++) {
                            await pool.query(
                                `INSERT INTO ficha_tecnica_fotos (pro_codigo_fic, foto_base64, ordem, updated_at) VALUES ($1, $2, $3, NOW())`,
                                [sanitize(row.PRO_CODIGO_FIC), fotosRelatorio[i], i]
                            );
                        }
                    }

                    // INSERT complete record into Postgres (NO TRUNCATE HERE)
                    await pool.query(`
                        INSERT INTO ficha_tecnica (
                            pro_codigo_fic, material_fic, peso_liquido_fic, peso_unit_pcp_fic,
                            tipo_moldagem_desc_fic, operacao_moldagem_desc_fic,
                            descricao_fic, nome_pro, peso_liquido_pro, peso_bruto_pro,
                            situacao_pro, cliente_nome, cli_codigo_fic, cli_codgio_fic,
                            modelo_fic, peso_bolo_fic, qtde_caixas_macho, pintura_tipo, fornecimento_desc,
                            peso_penca, peso_com_alimentacao, peso_sem_alimentacao, relacao_molde_metal,
                            peso_tampa, peso_fundo, qtde_figuras, tipo_modelo_desc, foto_base64,
                            peso_machos, detalhes_machos, tinta_refrataria_fic, detalhes_luvas, tipo_ferramental_fic,
                            lote_pmt, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, NOW())
                        ON CONFLICT (pro_codigo_fic) DO UPDATE SET
                            material_fic = EXCLUDED.material_fic,
                            peso_liquido_fic = EXCLUDED.peso_liquido_fic,
                            peso_unit_pcp_fic = EXCLUDED.peso_unit_pcp_fic,
                            tipo_moldagem_desc_fic = EXCLUDED.tipo_moldagem_desc_fic,
                            operacao_moldagem_desc_fic = EXCLUDED.operacao_moldagem_desc_fic,
                            descricao_fic = EXCLUDED.descricao_fic,
                            nome_pro = EXCLUDED.nome_pro,
                            cliente_nome = EXCLUDED.cliente_nome,
                            cli_codigo_fic = EXCLUDED.cli_codigo_fic,
                            cli_codgio_fic = EXCLUDED.cli_codgio_fic,
                            modelo_fic = EXCLUDED.modelo_fic,
                            peso_bolo_fic = EXCLUDED.peso_bolo_fic,
                            qtde_caixas_macho = EXCLUDED.qtde_caixas_macho,
                            pintura_tipo = EXCLUDED.pintura_tipo,
                            fornecimento_desc = EXCLUDED.fornecimento_desc,
                            peso_penca = EXCLUDED.peso_penca,
                            peso_com_alimentacao = EXCLUDED.peso_com_alimentacao,
                            peso_sem_alimentacao = EXCLUDED.peso_sem_alimentacao,
                            relacao_molde_metal = EXCLUDED.relacao_molde_metal,
                            peso_tampa = EXCLUDED.peso_tampa,
                            peso_fundo = EXCLUDED.peso_fundo,
                            qtde_figuras = EXCLUDED.qtde_figuras,
                            tipo_modelo_desc = EXCLUDED.tipo_modelo_desc,
                            foto_base64 = EXCLUDED.foto_base64,
                            peso_machos = EXCLUDED.peso_machos,
                            detalhes_machos = EXCLUDED.detalhes_machos,
                            tinta_refrataria_fic = EXCLUDED.tinta_refrataria_fic,
                            detalhes_luvas = EXCLUDED.detalhes_luvas,
                            tipo_ferramental_fic = EXCLUDED.tipo_ferramental_fic,
                            lote_pmt = EXCLUDED.lote_pmt,
                            updated_at = NOW();
                    `, [
                        sanitize(row.PRO_CODIGO_FIC), sanitize(materialReal || row.MAT_NOMENCLATURA_FIC), row.PESO_LIQUIDO_FIC, row.PESO_UNIT_PCP_FIC,
                        sanitize(row.TIPO_MOLDAGEM_DESC_FIC), sanitize(row.OPERACAO_MOLDAGEM_DESC_FIC), sanitize(descricao),
                        sanitize(row.NOME_PRO), row.PESO_LIQUIDO_PRO, row.PESO_BRUTO_PRO, sanitize(row.SITUACAO_PRO),
                        sanitize(row.NOME_CLIENTE), sanitize(row.CLI_CODIGO_FIC), sanitize(row.CLI_CODIGO_FIC),
                        sanitize(row.REFERENCIA_PRO || row.MODELO_FIC), row.CAVIDADE_PESO_BOLO_FIC, row.QTDE_CAIXAS_MACHO_FIC, sanitize(pintura), sanitize(fornecimento),
                        row.PESO_PENCA_FIC, row.PESO_UNITARIO_COM_ALIMENT_FIC, row.PESO_UNITARIO_SEM_ALIMENT_FIC, relacao,
                        row.PESO_TAMPA_FIC, row.PESO_FUNDO_FIC, row.CAVIDADE_QTDE_FIGURAS_FIC, sanitize(tipoModelo), fotoBase64,
                        row.PESO_MACHOS_FIC, sanitize(detalhesMachos), sanitize(row.TINTA_REFRATARIA_FIC), sanitize(detalhesLuvas), sanitize(row.TIPO_FERRAMENTAL_FIC),
                        sanitize(loteReal)
                    ]);
                    count++;
                    if (count % 10 === 0) console.log(`⏳ ${count}/${results.length} registros processados...`);
                } catch (e) {
                    console.error('Erro row:', e.message);
                }
            }
            console.log(`✅ Sincronização concluída: ${count} registros.`);
            db.detach();
        });
    });
}
syncFichas();
