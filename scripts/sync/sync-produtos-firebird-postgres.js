require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const pool = require('../../lib/db');
const { Firebird, options } = require('../../lib/firebird-helper');

const codeArg = process.argv.find(arg => arg.startsWith('--codigo='));
const onlyCode = codeArg ? codeArg.slice('--codigo='.length).trim() : '';
const catalogOnly = process.argv.includes('--catalogo');
const ELEMENTOS = ['C', 'SI', 'MN', 'P', 'S', 'CR', 'NI', 'MO', 'AL', 'V', 'CU', 'MG', 'W', 'B', 'CO', 'TI', 'NB', 'PB', 'SN', 'ZN', 'AS', 'BI', 'CA', 'CE', 'ZR', 'LA', 'FE'];

function clean(value) {
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value.replace(/\0/g, '').trim() || null : value;
}

function numeric(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}

function asBool(value) {
    return String(value || '').trim().toUpperCase() === 'S';
}

function fbQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
}

function connectFirebird() {
    return new Promise((resolve, reject) => Firebird.attach(options, (error, db) => error ? reject(error) : resolve(db)));
}

function blobToBuffer(blob) {
    return new Promise(resolve => {
        if (!blob) return resolve(null);
        if (Buffer.isBuffer(blob)) return resolve(blob);
        if (typeof blob !== 'function') return resolve(Buffer.from(String(blob)));
        blob((error, name, stream) => {
            if (error || !stream) return resolve(null);
            const chunks = [];
            stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', () => resolve(null));
        });
    });
}

function imageMime(buffer) {
    if (!buffer || buffer.length < 4) return null;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    if (buffer.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
    if (buffer.toString('ascii', 0, 2) === 'BM') return 'image/bmp';
    return 'image/jpeg';
}

async function imageBase64(blob) {
    const buffer = await blobToBuffer(blob);
    if (!buffer || !buffer.length) return null;
    return `data:${imageMime(buffer)};base64,${buffer.toString('base64')}`;
}

async function ensureTables(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync (
            codigo TEXT PRIMARY KEY, empresa INTEGER, nome TEXT, apelido TEXT, nome_tecnico TEXT,
            cliente_codigo TEXT, cliente_nome TEXT, grupo TEXT, subgrupo TEXT, divisao TEXT,
            situacao TEXT, tipo TEXT, unidade TEXT, unidade_producao TEXT,
            data_cadastro DATE, atualizado_origem TIMESTAMPTZ, peso_liquido NUMERIC, peso_bruto NUMERIC,
            ncm TEXT, ipi NUMERIC, custo_medio NUMERIC, custo_compra NUMERIC, custo_sem_impostos NUMERIC,
            preco_venda NUMERIC, preco_venda_2 NUMERIC, preco_venda_3 NUMERIC, observacao TEXT,
            observacao_fiscal TEXT, dados JSONB NOT NULL DEFAULT '{}'::jsonb, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync_materiais (
            produto_codigo TEXT PRIMARY KEY REFERENCES produtos_firebird_sync(codigo) ON DELETE CASCADE,
            material_id TEXT, material TEXT, lote TEXT, modelo TEXT, processo TEXT, local TEXT,
            peso_estimado NUMERIC, contracao NUMERIC, dureza_min NUMERIC, dureza_max NUMERIC,
            observacao TEXT, documento TEXT, revisao TEXT, composicao JSONB NOT NULL DEFAULT '[]'::jsonb,
            propriedades JSONB NOT NULL DEFAULT '{}'::jsonb, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync_fotos (
            produto_codigo TEXT NOT NULL REFERENCES produtos_firebird_sync(codigo) ON DELETE CASCADE,
            ordem INTEGER NOT NULL DEFAULT 0, principal BOOLEAN NOT NULL DEFAULT FALSE, foto_base64 TEXT NOT NULL,
            synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (produto_codigo, ordem)
        );
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync_fornecedores (
            produto_codigo TEXT NOT NULL REFERENCES produtos_firebird_sync(codigo) ON DELETE CASCADE,
            fornecedor_codigo TEXT NOT NULL, fornecedor_nome TEXT, codigo_produto_fornecedor TEXT,
            principal BOOLEAN NOT NULL DEFAULT FALSE, emissao_oc BOOLEAN NOT NULL DEFAULT FALSE,
            preco_unitario NUMERIC, observacao TEXT, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (produto_codigo, fornecedor_codigo, codigo_produto_fornecedor)
        );
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync_custos (
            id_origem TEXT PRIMARY KEY, produto_codigo TEXT NOT NULL REFERENCES produtos_firebird_sync(codigo) ON DELETE CASCADE,
            data DATE, hora TEXT, custo_anterior NUMERIC, custo_novo NUMERIC, usuario TEXT, observacao TEXT,
            synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync_medidas (
            produto_codigo TEXT PRIMARY KEY REFERENCES produtos_firebird_sync(codigo) ON DELETE CASCADE,
            dados JSONB NOT NULL DEFAULT '{}'::jsonb, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_produtos_sync_nome ON produtos_firebird_sync USING gin (to_tsvector('portuguese', coalesce(nome, '') || ' ' || coalesce(apelido, '')));
        CREATE INDEX IF NOT EXISTS idx_produtos_sync_fotos ON produtos_firebird_sync_fotos (produto_codigo, principal DESC, ordem);
        CREATE INDEX IF NOT EXISTS idx_produtos_sync_custos ON produtos_firebird_sync_custos (produto_codigo, data DESC);
    `);
}

function productData(row) {
    return {
        referencia: clean(row.REFERENCIA_PRO), referencia_base: clean(row.REFERENCIA_BASE_PRO),
        codigo_barras: clean(row.CODIGO_BARRAS_PRO), movimenta_estoque: clean(row.MOVIMENTA_ESTOQUE_PRO),
        modelo: clean(row.MODELO_PRO), desuso: clean(row.DESUSO_PRO), estoque_minimo: numeric(row.ESTOQUE_MINIMO_PRO),
        fator_carga: numeric(row.FATOR_CARGA_PRO), peso_estimado: numeric(row.PESO_ESTIMADO_PRO),
        volumetrica: numeric(row.VOLUMETRICA_PRO), indicador_estoque: clean(row.INDICADOR_ESTOQUE_PRO),
        casas_decimais_quantidade: numeric(row.CASAS_DECIMAIS_QUANTIDADE_PRO),
        casas_decimais_preco: numeric(row.CASAS_DECIMAIS_PRECO_PRO), regular_margem: numeric(row.REGULAR_MARGEM_PRO),
        percentual_desconto_maximo: numeric(row.PERC_DESCONTO_MAX_PRO), observacao_pauta: clean(row.OBSERVACAO_PAUTA_PRO)
    };
}

function productRecord(row) {
    return {
        codigo: String(row.CODIGO_PRO).trim(), empresa: numeric(row.EMPRESA_PRO), nome: clean(row.NOME_PRO), apelido: clean(row.APELIDO_PRO),
        nome_tecnico: clean(row.NOME_TECNICO_PRO), cliente_codigo: clean(row.CLIENTE_PRO), cliente_nome: clean(row.CLIENTE_NOME),
        grupo: clean(row.GRUPO_NOME), subgrupo: clean(row.SUBGRUPO_NOME), divisao: clean(row.DIVISAO_NOME), situacao: clean(row.SITUACAO_PRO),
        tipo: clean(row.TIPO_PRO), unidade: clean(row.UNIDADE_PRO), unidade_producao: clean(row.UNIDADE_PRODUCAO_PRO),
        data_cadastro: row.DATA_CADASTRO_PRO || null, atualizado_origem: row.DATA_HORA_ALTERACAO_PRO || null,
        peso_liquido: numeric(row.PESO_LIQUIDO_PRO), peso_bruto: numeric(row.PESO_BRUTO_PRO), ncm: clean(row.NCM_PRO), ipi: numeric(row.IPI_PRO),
        custo_medio: numeric(row.MEDIO_PRO), custo_compra: numeric(row.COMPRA_PRO), custo_sem_impostos: numeric(row.CUSTO_SEM_IMPOSTOS_PRO),
        preco_venda: numeric(row.VENDA_PRO), preco_venda_2: numeric(row.VENDA2_PRO), preco_venda_3: numeric(row.VENDA3_PRO),
        observacao: clean(row.OBSERVACAO_PRO), observacao_fiscal: clean(row.OBSERVACAO_FISCAL_PRO), dados: productData(row)
    };
}

async function syncProductCatalog(client, rows) {
    const chunkSize = 500;
    for (let start = 0; start < rows.length; start += chunkSize) {
        const records = rows.slice(start, start + chunkSize).map(productRecord);
        await client.query(`
            INSERT INTO produtos_firebird_sync (
                codigo,empresa,nome,apelido,nome_tecnico,cliente_codigo,cliente_nome,grupo,subgrupo,divisao,situacao,tipo,unidade,unidade_producao,
                data_cadastro,atualizado_origem,peso_liquido,peso_bruto,ncm,ipi,custo_medio,custo_compra,custo_sem_impostos,preco_venda,preco_venda_2,preco_venda_3,observacao,observacao_fiscal,dados,synced_at
            ) SELECT codigo,empresa,nome,apelido,nome_tecnico,cliente_codigo,cliente_nome,grupo,subgrupo,divisao,situacao,tipo,unidade,unidade_producao,
                data_cadastro,atualizado_origem,peso_liquido,peso_bruto,ncm,ipi,custo_medio,custo_compra,custo_sem_impostos,preco_venda,preco_venda_2,preco_venda_3,observacao,observacao_fiscal,dados,NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
                codigo TEXT,empresa INTEGER,nome TEXT,apelido TEXT,nome_tecnico TEXT,cliente_codigo TEXT,cliente_nome TEXT,grupo TEXT,subgrupo TEXT,divisao TEXT,situacao TEXT,tipo TEXT,unidade TEXT,unidade_producao TEXT,
                data_cadastro DATE,atualizado_origem TIMESTAMPTZ,peso_liquido NUMERIC,peso_bruto NUMERIC,ncm TEXT,ipi NUMERIC,custo_medio NUMERIC,custo_compra NUMERIC,custo_sem_impostos NUMERIC,preco_venda NUMERIC,preco_venda_2 NUMERIC,preco_venda_3 NUMERIC,observacao TEXT,observacao_fiscal TEXT,dados JSONB
            ) ON CONFLICT (codigo) DO UPDATE SET
                empresa=EXCLUDED.empresa,nome=EXCLUDED.nome,apelido=EXCLUDED.apelido,nome_tecnico=EXCLUDED.nome_tecnico,cliente_codigo=EXCLUDED.cliente_codigo,cliente_nome=EXCLUDED.cliente_nome,
                grupo=EXCLUDED.grupo,subgrupo=EXCLUDED.subgrupo,divisao=EXCLUDED.divisao,situacao=EXCLUDED.situacao,tipo=EXCLUDED.tipo,unidade=EXCLUDED.unidade,unidade_producao=EXCLUDED.unidade_producao,
                data_cadastro=EXCLUDED.data_cadastro,atualizado_origem=EXCLUDED.atualizado_origem,peso_liquido=EXCLUDED.peso_liquido,peso_bruto=EXCLUDED.peso_bruto,ncm=EXCLUDED.ncm,ipi=EXCLUDED.ipi,
                custo_medio=EXCLUDED.custo_medio,custo_compra=EXCLUDED.custo_compra,custo_sem_impostos=EXCLUDED.custo_sem_impostos,preco_venda=EXCLUDED.preco_venda,preco_venda_2=EXCLUDED.preco_venda_2,preco_venda_3=EXCLUDED.preco_venda_3,
                observacao=EXCLUDED.observacao,observacao_fiscal=EXCLUDED.observacao_fiscal,dados=EXCLUDED.dados,synced_at=NOW()
        `, [JSON.stringify(records)]);
        process.stdout.write(`@PROG:PRODUTOS:${Math.min(99, Math.round((start + records.length) / rows.length * 98) + 1)}%\n`);
    }
}

async function upsertProduct(client, row) {
    const code = String(row.CODIGO_PRO).trim();
    await client.query(`
        INSERT INTO produtos_firebird_sync (
            codigo, empresa, nome, apelido, nome_tecnico, cliente_codigo, cliente_nome, grupo, subgrupo, divisao,
            situacao, tipo, unidade, unidade_producao, data_cadastro, atualizado_origem, peso_liquido, peso_bruto,
            ncm, ipi, custo_medio, custo_compra, custo_sem_impostos, preco_venda, preco_venda_2, preco_venda_3,
            observacao, observacao_fiscal, dados, synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,NOW())
        ON CONFLICT (codigo) DO UPDATE SET
            empresa=EXCLUDED.empresa, nome=EXCLUDED.nome, apelido=EXCLUDED.apelido, nome_tecnico=EXCLUDED.nome_tecnico,
            cliente_codigo=EXCLUDED.cliente_codigo, cliente_nome=EXCLUDED.cliente_nome, grupo=EXCLUDED.grupo, subgrupo=EXCLUDED.subgrupo,
            divisao=EXCLUDED.divisao, situacao=EXCLUDED.situacao, tipo=EXCLUDED.tipo, unidade=EXCLUDED.unidade,
            unidade_producao=EXCLUDED.unidade_producao, data_cadastro=EXCLUDED.data_cadastro, atualizado_origem=EXCLUDED.atualizado_origem,
            peso_liquido=EXCLUDED.peso_liquido, peso_bruto=EXCLUDED.peso_bruto, ncm=EXCLUDED.ncm, ipi=EXCLUDED.ipi,
            custo_medio=EXCLUDED.custo_medio, custo_compra=EXCLUDED.custo_compra, custo_sem_impostos=EXCLUDED.custo_sem_impostos,
            preco_venda=EXCLUDED.preco_venda, preco_venda_2=EXCLUDED.preco_venda_2, preco_venda_3=EXCLUDED.preco_venda_3,
            observacao=EXCLUDED.observacao, observacao_fiscal=EXCLUDED.observacao_fiscal, dados=EXCLUDED.dados, synced_at=NOW()
    `, [
        code, numeric(row.EMPRESA_PRO), clean(row.NOME_PRO), clean(row.APELIDO_PRO), clean(row.NOME_TECNICO_PRO),
        clean(row.CLIENTE_PRO), clean(row.CLIENTE_NOME), clean(row.GRUPO_NOME), clean(row.SUBGRUPO_NOME), clean(row.DIVISAO_NOME),
        clean(row.SITUACAO_PRO), clean(row.TIPO_PRO), clean(row.UNIDADE_PRO), clean(row.UNIDADE_PRODUCAO_PRO), row.DATA_CADASTRO_PRO || null,
        row.DATA_HORA_ALTERACAO_PRO || null, numeric(row.PESO_LIQUIDO_PRO), numeric(row.PESO_BRUTO_PRO), clean(row.NCM_PRO), numeric(row.IPI_PRO),
        numeric(row.MEDIO_PRO), numeric(row.COMPRA_PRO), numeric(row.CUSTO_SEM_IMPOSTOS_PRO), numeric(row.VENDA_PRO), numeric(row.VENDA2_PRO), numeric(row.VENDA3_PRO),
        clean(row.OBSERVACAO_PRO), clean(row.OBSERVACAO_FISCAL_PRO), JSON.stringify(productData(row))
    ]);
    return code;
}

async function syncDetails(db, client, code) {
    const materialRows = await fbQuery(db, `
        SELECT FIRST 1 PM.*, M.MATERIAL_MAT, M.HB_MAT, M.HB_MAX_MAT, M.LIMITE_RESISTENCIA_MAT, M.LIMITE_ESCOAMENTO_MAT,
            M.ALONGAMENTO_MAT, M.ESTRICCAO_MAT, M.REDUCAO_AREA_MAT, M.IMPACTO_TESTE_CHARPY_MAT
        FROM PRODUTO_MATERIAL PM LEFT JOIN MATERIAL M ON M.ID_MAT=PM.MAT_ID_PMT WHERE PM.PRODUTO_PMT=?
    `, [code]);
    await client.query('DELETE FROM produtos_firebird_sync_materiais WHERE produto_codigo=$1', [code]);
    if (materialRows[0]) {
        const m = materialRows[0];
        const composicao = ELEMENTOS.map(elemento => ({ elemento, min: numeric(m[`${elemento}_MIN_PMT`]), max: numeric(m[`${elemento}_MAX_PMT`]) })).filter(item => item.min !== null || item.max !== null);
        const propriedades = {
            limite_resistencia: numeric(m.LIMITE_RESISTENCIA_MAT), limite_escoamento: numeric(m.LIMITE_ESCOAMENTO_MAT),
            alongamento: numeric(m.ALONGAMENTO_MAT), estriccao: numeric(m.ESTRICCAO_MAT), reducao_area: numeric(m.REDUCAO_AREA_MAT),
            impacto_charpy: numeric(m.IMPACTO_TESTE_CHARPY_MAT)
        };
        await client.query(`INSERT INTO produtos_firebird_sync_materiais (produto_codigo,material_id,material,lote,modelo,processo,local,peso_estimado,contracao,dureza_min,dureza_max,observacao,documento,revisao,composicao,propriedades)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [
            code, clean(String(m.MAT_ID_PMT || '')), clean(m.MATERIAL_MAT), clean(m.LOTE_PMT), clean(m.MODELO_FAB_PMT), clean(m.PROCESSO_PMT), clean(m.LOCAL_PMT),
            numeric(m.PESO_ESTIMADO_PMT), numeric(m.CONTRACAO_PMT), numeric(m.HB_MAT), numeric(m.HB_MAX_MAT), clean(m.OBSERVACAO_PMT), clean(m.NUMERO_DOCUMENTO_PMT), clean(m.REVISAO_PMT), JSON.stringify(composicao), JSON.stringify(propriedades)
        ]);
    }

    const photoRows = await fbQuery(db, 'SELECT FOTO_PFT, PRINCIPAL_PFT, ORDEM_PFT, CODIGO_PFT FROM PRODUTO_FOTO WHERE PRODUTO_PFT=? ORDER BY PRINCIPAL_PFT DESC, ORDEM_PFT, CODIGO_PFT', [code]);
    await client.query('DELETE FROM produtos_firebird_sync_fotos WHERE produto_codigo=$1', [code]);
    let photoOrder = 0;
    for (const photo of photoRows) {
        const value = await imageBase64(photo.FOTO_PFT);
        if (!value) continue;
        await client.query('INSERT INTO produtos_firebird_sync_fotos (produto_codigo,ordem,principal,foto_base64) VALUES ($1,$2,$3,$4)', [code, photoOrder++, asBool(photo.PRINCIPAL_PFT), value]);
    }

    const suppliers = await fbQuery(db, `
        SELECT PF.FRN_CODIGO_PRF, F.RAZAO_SOCIAL_FRN, PF.CODIGO_PRODUTO_PRF, PF.PRINCIPAL_PRF, PF.EMISSAO_OC_PRF,
            PPF.VALOR_UNITARIO_PPRF, PPF.OBSERVACAO_PPRF
        FROM PRODUTO_FORNECEDOR PF
        LEFT JOIN FORNECEDOR F ON F.EMPRESA_FRN=PF.FRN_EMPRESA_PRF AND F.CODIGO_FRN=PF.FRN_CODIGO_PRF
        LEFT JOIN PRODUTO_PRECO_FORNECEDOR PPF ON PPF.PRO_EMPERSA_PPRF=PF.PRO_EMPRESA_PRF AND PPF.PRO_CODIGO_PPRF=PF.PRO_CODIGO_PRF AND PPF.FRN_CODIGO_PPRF=PF.FRN_CODIGO_PRF
        WHERE PF.PRO_CODIGO_PRF=?
    `, [code]);
    await client.query('DELETE FROM produtos_firebird_sync_fornecedores WHERE produto_codigo=$1', [code]);
    const insertedSuppliers = new Set();
    for (const supplier of suppliers) {
        const supplierCode = String(supplier.FRN_CODIGO_PRF || '').trim();
        const supplierProduct = String(supplier.CODIGO_PRODUTO_PRF || '').trim();
        if (!supplierCode) continue;
        const supplierKey = `${supplierCode}:${supplierProduct}`;
        if (insertedSuppliers.has(supplierKey)) continue;
        insertedSuppliers.add(supplierKey);
        const observation = await blobToBuffer(supplier.OBSERVACAO_PPRF);
        await client.query(`INSERT INTO produtos_firebird_sync_fornecedores (produto_codigo,fornecedor_codigo,fornecedor_nome,codigo_produto_fornecedor,principal,emissao_oc,preco_unitario,observacao)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [code, supplierCode, clean(supplier.RAZAO_SOCIAL_FRN), supplierProduct, asBool(supplier.PRINCIPAL_PRF), asBool(supplier.EMISSAO_OC_PRF), numeric(supplier.VALOR_UNITARIO_PPRF), observation ? observation.toString('utf8').replace(/\0/g, '').trim() : null]);
    }

    const costs = await fbQuery(db, `
        SELECT PHC.ID_PHC, PHC.DATA_PHC, PHC.HORA_PHC, PHC.CUSTO_ANTIGO_PHC, PHC.CUSTO_NOVO_PHC, PHC.NOME_USUARIO_PHC, PHC.OBSERVACAO_PHC
        FROM PRODUTO_HISTORICO_CUSTO PHC JOIN PRODUTO_VENDA PV ON PV.ID_PRV=PHC.PRV_ID_PHC WHERE PV.CODIGO_PRV=? ORDER BY PHC.DATA_PHC DESC, PHC.HORA_PHC DESC
    `, [code]);
    await client.query('DELETE FROM produtos_firebird_sync_custos WHERE produto_codigo=$1', [code]);
    for (const cost of costs) await client.query(`INSERT INTO produtos_firebird_sync_custos (id_origem,produto_codigo,data,hora,custo_anterior,custo_novo,usuario,observacao)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [String(cost.ID_PHC), code, cost.DATA_PHC || null, clean(cost.HORA_PHC), numeric(cost.CUSTO_ANTIGO_PHC), numeric(cost.CUSTO_NOVO_PHC), clean(cost.NOME_USUARIO_PHC), clean(cost.OBSERVACAO_PHC)]);

    const measureRows = await fbQuery(db, 'SELECT FIRST 1 * FROM PRODUTO_MEDIDA_CERTIFICADO WHERE PRO_CODIGO_PMEC=?', [code]);
    await client.query('DELETE FROM produtos_firebird_sync_medidas WHERE produto_codigo=$1', [code]);
    if (measureRows[0]) {
        const data = {};
        Object.entries(measureRows[0]).forEach(([key, value]) => { if (value !== null && typeof value !== 'function') data[key.toLowerCase()] = clean(value); });
        await client.query('INSERT INTO produtos_firebird_sync_medidas (produto_codigo,dados) VALUES ($1,$2)', [code, JSON.stringify(data)]);
    }
}

async function findProductsInFirebird(query) {
    const db = await connectFirebird();
    try {
        const term = `%${String(query || '').trim().toUpperCase()}%`;
        const rows = await fbQuery(db, `
            SELECT FIRST 20 P.CODIGO_PRO, P.NOME_PRO, P.APELIDO_PRO, P.SITUACAO_PRO, P.UNIDADE_PRO,
                G.NOME_GRU AS GRUPO_NOME, C.RAZAO_SOCIAL_CLI AS CLIENTE_NOME
            FROM PRODUTO P
            LEFT JOIN GRUPO G ON G.EMPRESA_GRU=P.GRU_EMPRESA_PRO AND G.CODIGO_GRU=P.GRUPO_PRO
            LEFT JOIN CLIENTE C ON C.EMPRESA_CLI=P.EMPRESA_PRO AND C.CODIGO_CLI=P.CLIENTE_PRO
            WHERE P.CODIGO_PRO LIKE ?
            ORDER BY P.CODIGO_PRO
        `, [term]);
        return rows.map(row => ({
            codigo: String(row.CODIGO_PRO).trim(), nome: clean(row.NOME_PRO), apelido: clean(row.APELIDO_PRO),
            situacao: clean(row.SITUACAO_PRO), unidade: clean(row.UNIDADE_PRO), grupo: clean(row.GRUPO_NOME),
            cliente_nome: clean(row.CLIENTE_NOME), foto: null
        }));
    } finally {
        db.detach();
    }
}

async function syncProductByCode(productCode) {
    const db = await connectFirebird();
    const client = await pool.connect();
    try {
        await ensureTables(client);
        const products = await fbQuery(db, `
            SELECT P.*, C.RAZAO_SOCIAL_CLI AS CLIENTE_NOME, G.NOME_GRU AS GRUPO_NOME, SG.NOME_SUB AS SUBGRUPO_NOME, D.NOME_DIV AS DIVISAO_NOME
            FROM PRODUTO P
            LEFT JOIN CLIENTE C ON C.EMPRESA_CLI=P.EMPRESA_PRO AND C.CODIGO_CLI=P.CLIENTE_PRO
            LEFT JOIN GRUPO G ON G.EMPRESA_GRU=P.GRU_EMPRESA_PRO AND G.CODIGO_GRU=P.GRUPO_PRO
            LEFT JOIN SUB_GRUPO SG ON SG.EMPRESA_SUB=P.SUB_EMPRESA_PRO AND SG.CODIGO_SUB=P.SUB_GRUPO_PRO
            LEFT JOIN DIVISAO D ON D.EMPRESA_DIV=P.DIV_EMPRESA_PRO AND D.CODIGO_DIV=P.DIV_CODIGO_PRO
            WHERE P.CODIGO_PRO=?
        `, [productCode]);
        if (!products[0]) return false;
        const code = await upsertProduct(client, products[0]);
        await syncDetails(db, client, code);
        return true;
    } finally {
        client.release();
        db.detach();
    }
}

if (require.main !== module) {
    module.exports = { findProductsInFirebird, syncProductByCode };
    main = async () => {};
}

async function main() {
    const db = await connectFirebird();
    const client = await pool.connect();
    const startedAt = new Date();
    try {
        await ensureTables(client);
        const where = onlyCode ? 'WHERE P.CODIGO_PRO=?' : '';
        const products = await fbQuery(db, `
            SELECT P.*, C.RAZAO_SOCIAL_CLI AS CLIENTE_NOME, G.NOME_GRU AS GRUPO_NOME, SG.NOME_SUB AS SUBGRUPO_NOME, D.NOME_DIV AS DIVISAO_NOME
            FROM PRODUTO P
            LEFT JOIN CLIENTE C ON C.EMPRESA_CLI=P.EMPRESA_PRO AND C.CODIGO_CLI=P.CLIENTE_PRO
            LEFT JOIN GRUPO G ON G.EMPRESA_GRU=P.GRU_EMPRESA_PRO AND G.CODIGO_GRU=P.GRUPO_PRO
            LEFT JOIN SUB_GRUPO SG ON SG.EMPRESA_SUB=P.SUB_EMPRESA_PRO AND SG.CODIGO_SUB=P.SUB_GRUPO_PRO
            LEFT JOIN DIVISAO D ON D.EMPRESA_DIV=P.DIV_EMPRESA_PRO AND D.CODIGO_DIV=P.DIV_CODIGO_PRO
            ${where} ORDER BY P.CODIGO_PRO
        `, onlyCode ? [onlyCode] : []);
        console.log(`Sincronizando ${products.length} produto(s)...`);
        process.stdout.write('@PROG:PRODUTOS:1%\n');
        if (catalogOnly) {
            await syncProductCatalog(client, products);
            await client.query('DELETE FROM produtos_firebird_sync WHERE synced_at < $1', [startedAt]);
            await client.query(`INSERT INTO sync_status (screen_name,last_sync_at) VALUES ('Produtos',NOW()) ON CONFLICT (screen_name) DO UPDATE SET last_sync_at=NOW()`);
            process.stdout.write('@PROG:PRODUTOS:100%\n');
            console.log(`Catálogo de produtos sincronizado: ${products.length}.`);
            return;
        }
        let completed = 0;
        for (const row of products) {
            const code = await upsertProduct(client, row);
            await syncDetails(db, client, code);
            completed++;
            if (completed % 10 === 0 || completed === products.length) process.stdout.write(`@PROG:PRODUTOS:${Math.min(99, Math.round(completed / Math.max(products.length, 1) * 98) + 1)}%\n`);
        }
        if (!onlyCode) {
            await client.query('DELETE FROM produtos_firebird_sync WHERE synced_at < $1', [startedAt]);
            await client.query(`INSERT INTO sync_status (screen_name,last_sync_at) VALUES ('Produtos',NOW()) ON CONFLICT (screen_name) DO UPDATE SET last_sync_at=NOW()`);
        }
        process.stdout.write('@PROG:PRODUTOS:100%\n');
        console.log(`Produtos sincronizados: ${completed}.`);
    } finally {
        client.release();
        db.detach();
        await pool.end();
    }
}

main().catch(error => { console.error('Erro na sincronização de produtos:', error.message); process.exit(1); });
