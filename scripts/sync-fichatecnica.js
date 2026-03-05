const Firebird = require('node-firebird');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const firebirdOptions = {
    host: '10.1.1.100', port: 3050, database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, pageSize: 4096
};

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

// Helper to read Firebird BLOBs as Buffer (for images)
function readBlobBuffer(blob) {
    return new Promise((resolve, reject) => {
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
    return new Promise((resolve, reject) => {
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
        const obsMatch = raw.match(/OBS:/i);
        if (!obsMatch) return raw;
        const content = raw.substring(obsMatch.index);
        return content.replace(/\\par/g, '\n').replace(/}/g, '').trim();
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
            if (err) {
                console.error(`⚠️ Erro ao buscar machos para ficha ID ${fichaCodigo}:`, err);
                return resolve([]);
            }
            resolve(results);
        });
    });
}

function getLuvas(db, fichaCodigo) {
    return new Promise((resolve) => {
        db.query(`
            SELECT FIP.QUANTIDADE_FIP as QUANTIDADE_PCM, P.NOME_PRO as NOME_LUVA
            FROM FICHA_TECNICA_PRODUTO FIP
            LEFT JOIN PRODUTO P ON P.CODIGO_PRO = FIP.PRO_CODIGO_FIP
            WHERE FIP.FIC_CODIGO_FIP = ?
        `, [fichaCodigo], (err, results) => {
            if (err) {
                console.error(`⚠️ Erro ao buscar luvas para ficha ID ${fichaCodigo}:`, err);
                return resolve([]);
            }
            resolve(results);
        });
    });
}

async function syncFichas() {
    console.log('🚀 Sincronização de Fichas Técnicas (incluindo fotos)...');
    const client = await pgPool.connect();

    // Buscar códigos em carteira no Postgres para priorização (da tabela firebird_sync_pedidos)
    console.log('🔍 Buscando códigos em carteira (firebird_sync_pedidos) para priorização...');
    const carteiraRes = await client.query("SELECT DISTINCT (data->>'PRODUTO_PPR') as codigo FROM firebird_sync_pedidos WHERE data->>'PRODUTO_PPR' IS NOT NULL");
    const portfolioCodes = new Set(carteiraRes.rows.map(r => String(r.codigo).trim()));
    console.log(`📌 ${portfolioCodes.size} códigos encontrados na carteira sincronizada.`);

    Firebird.attach(firebirdOptions, function (err, db) {
        if (err) { console.error('Erro Firebird:', err); client.release(); return; }

        const sql = `
            SELECT 
                F.CODIGO_FIC, F.PRO_CODIGO_FIC, F.MAT_NOMENCLATURA_FIC, F.PESO_LIQUIDO_FIC, F.PESO_UNIT_PCP_FIC,
                F.TIPO_MOLDAGEM_DESC_FIC, F.OPERACAO_MOLDAGEM_DESC_FIC,
                F.DESCRICAO_FIC, F.CLI_CODIGO_FIC, F.MODELO_FIC, F.CAVIDADE_PESO_BOLO_FIC,
                F.QTDE_CAIXAS_MACHO_FIC, F.PINTAR_PISTOLA_FIC, F.PINTAR_IMERSAO_FIC,
                F.FORNECIMENTO_FIC, F.PESO_PENCA_FIC, F.PESO_UNITARIO_COM_ALIMENT_FIC,
                F.PESO_UNITARIO_SEM_ALIMENT_FIC, F.RELACAO_MOLDE_METAL_FIC,
                F.PESO_TAMPA_FIC, F.PESO_FUNDO_FIC, F.CAVIDADE_QTDE_FIGURAS_FIC, F.TIPO_MODELO_FIC,
                F.MINIATURA_FIC, F.PESO_MACHOS_FIC, F.DATA_FIC, F.TINTA_REFRATARIA_FIC, F.MOLDAGEM_OBS_FIC,
                P.NOME_PRO, P.PESO_LIQUIDO_PRO, P.PESO_BRUTO_PRO, P.SITUACAO_PRO, P.REFERENCIA_PRO,
                C.RAZAO_SOCIAL_CLI as NOME_CLIENTE,
                (SELECT FIRST 1 M.MATERIAL_MAT 
                 FROM PRODUTO_MATERIAL PM 
                 JOIN MATERIAL M ON M.ID_MAT = PM.MAT_ID_PMT 
                 WHERE PM.PRODUTO_PMT = F.PRO_CODIGO_FIC) as MATERIAL_REAL
            FROM FICHA_TECNICA F
            LEFT JOIN PRODUTO P ON P.CODIGO_PRO = F.PRO_CODIGO_FIC
            LEFT JOIN CLIENTE C ON C.CODIGO_CLI = F.CLI_CODIGO_FIC
            WHERE F.EMP_CODIGO_FIC = 10 AND F.ATIVO_FIC = 'S'
        `;

        console.log('📥 Executando query no Firebird...');
        db.query(sql, async function (err, results) {
            if (err) { console.error('Erro query:', err); db.detach(); client.release(); return; }

            console.log(`📊 ${results.length} registros recebidos. Ordenando por prioridade (Carteira > Data)...`);

            // Ordenação: 
            // 1. Em carteira (portfolioCodes)
            // 2. Data Decrescente (mais recentes primeiro)
            results.sort((a, b) => {
                const aIdx = portfolioCodes.has(String(a.PRO_CODIGO_FIC).trim()) ? 0 : 1;
                const bIdx = portfolioCodes.has(String(b.PRO_CODIGO_FIC).trim()) ? 0 : 1;

                if (aIdx !== bIdx) return aIdx - bIdx;

                // DATA_FIC fallback
                const dataA = a.DATA_FIC ? new Date(a.DATA_FIC) : new Date(0);
                const dataB = b.DATA_FIC ? new Date(b.DATA_FIC) : new Date(0);
                return dataB - dataA;
            });

            console.log(`✅ Ordenação concluída. Iniciando processamento...`);
            let count = 0;
            for (const row of results) {
                try {
                    const pintura = String(row.PINTAR_PISTOLA_FIC).trim() === 'S' ? 'PISTOLA' : (String(row.PINTAR_IMERSAO_FIC).trim() === 'S' ? 'IMERSAO' : '-');
                    const fornMap = { 'BT': 'BRUTO', 'PU': 'PRÉ-USINADO', 'US': 'USINADO', 'FJ': 'FORJADO', 'FB': 'FABRICADO' };
                    const fornecimento = fornMap[String(row.FORNECIMENTO_FIC).trim()] || row.FORNECIMENTO_FIC || '-';
                    const modelMap = { 0: 'MODELO EM CAIXA', 1: 'MODELO EM PLACA', 2: 'MODELO SOLTO' };
                    const tipoModelo = modelMap[row.TIPO_MODELO_FIC] || '-';
                    const relacao = row.RELACAO_MOLDE_METAL_FIC || 0;

                    const descricaoRaw = await readBlob(row.MOLDAGEM_OBS_FIC || row.DESCRICAO_FIC);
                    const descricao = parseObservation(descricaoRaw);
                    const fotoBuffer = await readBlobBuffer(row.MINIATURA_FIC);
                    const fotoBase64 = fotoBuffer ? fotoBuffer.toString('base64') : null;

                    // Fetch and format Machos (using CODIGO_FIC for join)
                    const machosList = await getMachos(db, row.CODIGO_FIC);
                    const pinturaMachoMap = { 'N': 'NÃO SE APLICA', 'L': 'LAVAGEM', 'P': 'PINCEL', 'S': 'PISTOLA', 'I': 'IMERSÃO' };
                    const tipoMachoMap = { '5': 'PEPSET', '0': 'CURA FRIO' };

                    const mapMulti = (str, map) => {
                        if (!str) return '-';
                        return String(str).split(/[;,]/)
                            .map(p => p.trim())
                            .filter(p => p !== '')
                            .map(p => map[p] || p)
                            .join(' / ') || '-';
                    };

                    const detalhesMachos = machosList.map(m => {
                        const pMacho = mapMulti(m.PINTURA_FTCM, pinturaMachoMap);
                        const tMacho = mapMulti(m.TIPO_MOLDAGEM_FTCM, tipoMachoMap);
                        return `MACHO ${m.SEQUENCIA_FTCM} - QTDE: ${m.QUANTIDADE_CADA_FTCM} - TIPO: ${tMacho} - PINTURA: ${pMacho}`;
                    }).join('\n');

                    // Fetch and format Luvas
                    const luvasList = await getLuvas(db, row.CODIGO_FIC);
                    const detalhesLuvas = luvasList.map(l => {
                        return `LUVA: ${l.NOME_LUVA || '-'} - QTDE: ${l.QUANTIDADE_PCM || 0}`;
                    }).join('\n');

                    await client.query(`
                        INSERT INTO ficha_tecnica (
                            pro_codigo_fic, material_fic, peso_liquido_fic, peso_unit_pcp_fic,
                            tipo_moldagem_desc_fic, operacao_moldagem_desc_fic,
                            descricao_fic, nome_pro, peso_liquido_pro, peso_bruto_pro,
                            situacao_pro, cliente_nome, cli_codigo_fic, cli_codgio_fic,
                            modelo_fic, peso_bolo_fic, qtde_caixas_macho, pintura_tipo, fornecimento_desc,
                            peso_penca, peso_com_alimentacao, peso_sem_alimentacao, relacao_molde_metal,
                            peso_tampa, peso_fundo, qtde_figuras, tipo_modelo_desc, foto_base64,
                            peso_machos, detalhes_machos, tinta_refrataria_fic, detalhes_luvas, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, NOW())
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
                            updated_at = NOW();
                    `, [
                        String(row.PRO_CODIGO_FIC).trim(), row.MATERIAL_REAL || row.MAT_NOMENCLATURA_FIC, row.PESO_LIQUIDO_FIC, row.PESO_UNIT_PCP_FIC,
                        row.TIPO_MOLDAGEM_DESC_FIC, row.OPERACAO_MOLDAGEM_DESC_FIC, descricao,
                        row.NOME_PRO, row.PESO_LIQUIDO_PRO, row.PESO_BRUTO_PRO, row.SITUACAO_PRO,
                        row.NOME_CLIENTE, String(row.CLI_CODIGO_FIC).trim(), String(row.CLI_CODIGO_FIC).trim(),
                        row.REFERENCIA_PRO || row.MODELO_FIC, row.CAVIDADE_PESO_BOLO_FIC, row.QTDE_CAIXAS_MACHO_FIC, pintura, fornecimento,
                        row.PESO_PENCA_FIC, row.PESO_UNITARIO_COM_ALIMENT_FIC, row.PESO_UNITARIO_SEM_ALIMENT_FIC, relacao,
                        row.PESO_TAMPA_FIC, row.PESO_FUNDO_FIC, row.CAVIDADE_QTDE_FIGURAS_FIC, tipoModelo, fotoBase64,
                        row.PESO_MACHOS_FIC, detalhesMachos, row.TINTA_REFRATARIA_FIC, detalhesLuvas
                    ]);
                    count++;
                } catch (e) {
                    console.error('Erro row:', e.message);
                }
            }
            console.log(`✅ Sincronização concluída: ${count} registros.`);
            db.detach(); client.release(); await pgPool.end();
        });
    });
}
syncFichas();
