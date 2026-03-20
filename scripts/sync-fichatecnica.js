const Firebird = require('node-firebird');
const pool = require('../lib/db');
require('dotenv').config({ path: '.env.local' });

const firebirdOptions = {
    host: '10.1.1.100', port: 3050, database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, pageSize: 4096
};

function sanitize(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\0/g, '').trim();
}

const readBlob = (blob) => new Promise(res => {
    if (!blob || typeof blob !== 'function') return res('');
    blob((err, name, stream) => {
        if (err) return res('');
        let chunks = [];
        stream.on('data', c => chunks.push(c));
        stream.on('end', () => res(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', () => res(''));
    });
});

const readBlobBuffer = (blob) => new Promise(res => {
    if (!blob || typeof blob !== 'function') return res(null);
    blob((err, name, stream) => {
        if (err) return res(null);
        let chunks = [];
        stream.on('data', c => chunks.push(c));
        stream.on('end', () => res(Buffer.concat(chunks)));
        stream.on('error', () => res(null));
    });
});

function parseObservation(raw) {
    if (!raw) return '';
    try {
        const obsMatch = raw.match(/OBS:/i);
        let content = obsMatch ? raw.substring(obsMatch.index) : raw;
        content = content.replace(/\\par\b/g, '\n').replace(/\\[a-z]+[0-9]*/gi, '').replace(/[{}]/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n');
        return content.trim();
    } catch (e) { return raw; }
}

async function syncFichas() {
    console.log('🚀 Iniciando Sincronização FOCADA de Fichas Técnicas...');
    const startTime = Date.now();

    try {
        // 1. Get active products from Postgres Carteira
        console.log('🔍 Buscando produtos ativos na carteira (Postgres)...');
        const carteiraRes = await pool.query('SELECT DISTINCT codigo FROM carteira WHERE codigo IS NOT NULL');
        const activeProducts = carteiraRes.rows.map(r => String(r.codigo).trim());

        if (activeProducts.length === 0) {
            console.log('⚠️ Nenhuma OP ativa encontrada na carteira. Nada para sincronizar.');
            process.exit(0);
        }

        console.log(`📦 Encontrados ${activeProducts.length} produtos ativos na carteira.`);

        Firebird.attach(firebirdOptions, async function (err, db) {
            if (err) { console.error('Erro Firebird:', err); return; }

            try {
                console.log('📥 Coletando dados de referência e fichas técnicas...');
                
                // Fetch materials map
                const materials = await new Promise(res => db.query('SELECT PM.PRODUTO_PMT, M.MATERIAL_MAT FROM PRODUTO_MATERIAL PM JOIN MATERIAL M ON M.ID_MAT = PM.MAT_ID_PMT', (e, r) => res(r || [])));
                const materialMap = {}; materials.forEach(m => materialMap[m.PRODUTO_PMT] = m.MATERIAL_MAT);

                // Main query filtered by product codes
                // We use a temporary string of codes for the IN clause or handle it in chunks if too many
                const results = [];
                const chunkSize = 100;
                for (let i = 0; i < activeProducts.length; i += chunkSize) {
                    const batch = activeProducts.slice(i, i + chunkSize);
                    const placeholders = batch.map(c => `'${c}'`).join(',');
                    const batchResults = await new Promise(res => db.query(`
                        SELECT 
                            F.CODIGO_FIC, F.PRO_CODIGO_FIC, F.MAT_NOMENCLATURA_FIC, F.PESO_LIQUIDO_FIC, F.PESO_UNIT_PCP_FIC,
                            F.TIPO_MOLDAGEM_DESC_FIC, F.OPERACAO_MOLDAGEM_DESC_FIC, F.CLI_CODIGO_FIC, F.MODELO_FIC, F.CAVIDADE_PESO_BOLO_FIC,
                            F.QTDE_CAIXAS_MACHO_FIC, F.PINTAR_PISTOLA_FIC, F.PINTAR_IMERSAO_FIC, F.FORNECIMENTO_FIC, F.PESO_PENCA_FIC,
                            F.PESO_UNITARIO_COM_ALIMENT_FIC, F.PESO_UNITARIO_SEM_ALIMENT_FIC, F.RELACAO_MOLDE_METAL_FIC,
                            F.PESO_TAMPA_FIC, F.PESO_FUNDO_FIC, F.CAVIDADE_QTDE_FIGURAS_FIC, F.TIPO_MODELO_FIC,
                            F.PESO_MACHOS_FIC, F.DATA_FIC, F.TINTA_REFRATARIA_FIC, F.MOLDAGEM_OBS_FIC, F.MINIATURA_FIC,
                            PRO.NOME_PRO, PRO.PESO_LIQUIDO_PRO, PRO.PESO_BRUTO_PRO, PRO.SITUACAO_PRO, PRO.REFERENCIA_PRO, C.RAZAO_SOCIAL_CLI as NOME_CLIENTE
                        FROM FICHA_TECNICA F
                        JOIN PRODUTO PRO ON PRO.CODIGO_PRO = F.PRO_CODIGO_FIC
                        LEFT JOIN CLIENTE C ON C.CODIGO_CLI = F.CLI_CODIGO_FIC
                        WHERE F.EMP_CODIGO_FIC = 10 AND F.ATIVO_FIC = 'S'
                        AND F.PRO_CODIGO_FIC IN (${placeholders})
                    `, (e, r) => res(r || [])));
                    results.push(...batchResults);
                }

                console.log(`📊 Processando ${results.length} fichas técnicas encontradas...`);

                if (results.length === 0) {
                    console.log('⚠️ Nenhuma ficha técnica encontrada para os produtos ativos.');
                    db.detach();
                    process.exit(0);
                }

                // Fetch Machos and Luvas for these specific fichas
                const fichaIds = results.map(r => r.CODIGO_FIC).join(',');
                const machos = await new Promise(res => db.query(`SELECT FIC_CODIGO_FTCM, SEQUENCIA_FTCM, QUANTIDADE_CADA_FTCM FROM FICHA_TECNICA_CAIXA_MACHO WHERE FIC_CODIGO_FTCM IN (${fichaIds})`, (e, r) => res(r || [])));
                const machoMap = {}; machos.forEach(m => { if(!machoMap[m.FIC_CODIGO_FTCM]) machoMap[m.FIC_CODIGO_FTCM] = []; machoMap[m.FIC_CODIGO_FTCM].push(m); });

                const luvas = await new Promise(res => db.query(`SELECT FIP.FIC_CODIGO_FIP, FIP.QUANTIDADE_FIP, P.NOME_PRO FROM FICHA_TECNICA_PRODUTO FIP LEFT JOIN PRODUTO P ON P.CODIGO_PRO = FIP.PRO_CODIGO_FIP WHERE FIP.FIC_CODIGO_FIP IN (${fichaIds})`, (e, r) => res(r || [])));
                const luvaMap = {}; luvas.forEach(l => { if(!luvaMap[l.FIC_CODIGO_FIP]) luvaMap[l.FIC_CODIGO_FIP] = []; luvaMap[l.FIC_CODIGO_FIP].push(l); });

                const routeLink = await new Promise(res => db.query(`SELECT FIC_CODIGO_FTPC, SET_CODIGO_FTPC FROM FICHA_TECNICA_PROCEDIMENTO WHERE FIC_CODIGO_FTPC IN (${fichaIds}) AND SET_EMPRESA_FTPC = 10`, (e, r) => res(r || [])));
                const routeMap = {}; routeLink.forEach(rt => { if(!routeMap[rt.FIC_CODIGO_FTPC]) routeMap[rt.FIC_CODIGO_FTPC] = []; routeMap[rt.FIC_CODIGO_FTPC].push(rt.SET_CODIGO_FTPC); });

                // Process in parallel with smaller chunks for stability
                const pgTransSize = 50;
                for (let i = 0; i < results.length; i += pgTransSize) {
                    const transChunk = results.slice(i, i + pgTransSize);
                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        await Promise.all(transChunk.map(async (row) => {
                            const [obsRaw, fotoBuffer] = await Promise.all([readBlob(row.MOLDAGEM_OBS_FIC), readBlobBuffer(row.MINIATURA_FIC)]);
                            const descricao = obsRaw ? parseObservation(obsRaw) : '';
                            const fotoBase64 = fotoBuffer ? fotoBuffer.toString('base64') : null;
                            const material = materialMap[row.PRO_CODIGO_FIC] || row.MAT_NOMENCLATURA_FIC;
                            const painting = String(row.PINTAR_PISTOLA_FIC).trim() === 'S' ? 'PISTOLA' : (String(row.PINTAR_IMERSAO_FIC).trim() === 'S' ? 'IMERSAO' : '-');
                            
                            const mList = machoMap[row.CODIGO_FIC] || [];
                            const detalhesMachos = mList.map(m => `MACHO ${m.SEQUENCIA_FTCM} - QTDE: ${m.QUANTIDADE_CADA_FTCM}`).join('\n');
                            
                            const lList = luvaMap[row.CODIGO_FIC] || [];
                            const detalhesLuvas = lList.map(l => `LUVA: ${l.NOME_PRO || '-'} - QTDE: ${l.QUANTIDADE_FIP}`).join('\n');

                            await client.query(`
                                INSERT INTO ficha_tecnica (
                                    codigo_fic, pro_codigo_fic, material_fic, peso_liquido_fic, peso_unit_pcp_fic, tipo_moldagem_desc_fic,
                                    operacao_moldagem_desc_fic, descricao_fic, nome_pro, peso_liquido_pro, peso_bruto_pro,
                                    situacao_pro, cliente_nome, cli_codigo_fic, cli_codgio_fic, modelo_fic, peso_bolo_fic,
                                    qtde_caixas_macho, pintura_tipo, fornecimento_desc, peso_penca, peso_com_alimentacao,
                                    peso_sem_alimentacao, relacao_molde_metal, peso_tampa, peso_fundo, qtde_figuras,
                                    tipo_modelo_desc, foto_base64, peso_machos, detalhes_machos, tinta_refrataria_fic, detalhes_luvas, updated_at
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, NOW())
                                ON CONFLICT (pro_codigo_fic) DO UPDATE SET
                                    codigo_fic = EXCLUDED.codigo_fic,
                                    descricao_fic = EXCLUDED.descricao_fic, nome_pro = EXCLUDED.nome_pro, 
                                    foto_base64 = EXCLUDED.foto_base64, updated_at = NOW();
                            `, [
                                row.CODIGO_FIC, sanitize(row.PRO_CODIGO_FIC), sanitize(material), row.PESO_LIQUIDO_FIC, row.PESO_UNIT_PCP_FIC,
                                sanitize(row.TIPO_MOLDAGEM_DESC_FIC), sanitize(row.OPERACAO_MOLDAGEM_DESC_FIC), sanitize(descricao),
                                sanitize(row.NOME_PRO), row.PESO_LIQUIDO_PRO, row.PESO_BRUTO_PRO, sanitize(row.SITUACAO_PRO),
                                sanitize(row.NOME_CLIENTE), sanitize(row.CLI_CODIGO_FIC), sanitize(row.CLI_CODIGO_FIC),
                                sanitize(row.REFERENCIA_PRO || row.MODELO_FIC), row.CAVIDADE_PESO_BOLO_FIC, row.QTDE_CAIXAS_MACHO_FIC,
                                sanitize(painting), sanitize(row.FORNECIMENTO_FIC), row.PESO_PENCA_FIC, row.PESO_UNITARIO_COM_ALIMENT_FIC,
                                row.PESO_UNITARIO_SEM_ALIMENT_FIC, row.RELACAO_MOLDE_METAL_FIC || 0, row.PESO_TAMPA_FIC, row.PESO_FUNDO_FIC,
                                row.CAVIDADE_QTDE_FIGURAS_FIC, sanitize(row.TIPO_MODELO_FIC), fotoBase64, row.PESO_MACHOS_FIC,
                                sanitize(detalhesMachos), sanitize(row.TINTA_REFRATARIA_FIC), sanitize(detalhesLuvas)
                            ]);

                            const pCodes = routeMap[row.CODIGO_FIC] || [];
                            if (pCodes.length > 0) {
                                await client.query('DELETE FROM ficha_tecnica_procedimento WHERE pro_codigo_fic = $1', [sanitize(row.PRO_CODIGO_FIC)]);
                                for (const c of pCodes) await client.query('INSERT INTO ficha_tecnica_procedimento (pro_codigo_fic, set_codigo_fic) VALUES ($1, $2) ON CONFLICT DO NOTHING', [sanitize(row.PRO_CODIGO_FIC), c]);
                            }
                        }));
                        await client.query('COMMIT');
                        console.log(`⏳ Progress: ${Math.min(i + pgTransSize, results.length)}/${results.length} fichas synced.`);
                    } catch (pgErr) {
                        await client.query('ROLLBACK'); console.error('❌ Erro no batch:', pgErr.message);
                    } finally { client.release(); }
                }

                console.log(`✅ Sincronização FOCADA finalizada em ${((Date.now() - startTime) / 1000).toFixed(1)}s!`);
                db.detach();
                process.exit(0);

            } catch (e) { console.error('❌ Erro Fatal Firebird Query:', e); process.exit(1); }
        });
    } catch (e) {
        console.error('❌ Erro ao buscar produtos ativos:', e);
        process.exit(1);
    }
}
syncFichas();
