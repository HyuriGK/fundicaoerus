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
    console.log('🚀 Iniciando sincronização EXPANDIDA de Fichas Técnicas...');

    // 1. Criar/Atualizar tabela no Postgres
    const client = await pgPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS ficha_tecnica (
                pro_codigo_fic VARCHAR(50) PRIMARY KEY,
                material_fic VARCHAR(255),
                peso_liquido_fic DECIMAL(15,3),
                peso_unit_pcp_fic DECIMAL(15,3),
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
                cliente_nome VARCHAR(255),
                modelo_fic VARCHAR(100),
                peso_bolo_fic DECIMAL(15,3),
                qtde_caixas_macho INTEGER,
                pintura_tipo VARCHAR(100),
                fornecimento_desc VARCHAR(100),
                peso_penca DECIMAL(15,3),
                peso_com_alimentacao DECIMAL(15,3),
                peso_sem_alimentacao DECIMAL(15,3),
                relacao_molde_metal DECIMAL(15,3),
                peso_tampa DECIMAL(15,3),
                peso_fundo DECIMAL(15,3),
                qtde_figuras INTEGER,
                tipo_modelo_desc VARCHAR(100),
                miniatura_link TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Garante que todas as colunas novas existam (caso a tabela já tenha sido criada antes da expansão)
        const columns = [
            'cliente_nome VARCHAR(255)', 'modelo_fic VARCHAR(100)', 'peso_bolo_fic DECIMAL(15,3)',
            'qtde_caixas_macho INTEGER', 'pintura_tipo VARCHAR(100)', 'fornecimento_desc VARCHAR(100)',
            'peso_penca DECIMAL(15,3)', 'peso_com_alimentacao DECIMAL(15,3)', 'peso_sem_alimentacao DECIMAL(15,3)',
            'relacao_molde_metal DECIMAL(15,3)', 'peso_tampa DECIMAL(15,3)', 'peso_fundo DECIMAL(15,3)',
            'qtde_figuras INTEGER', 'tipo_modelo_desc VARCHAR(100)', 'miniatura_link TEXT',
            'peso_unit_pcp_fic DECIMAL(15,3)'
        ];

        for (const col of columns) {
            try {
                const colName = col.split(' ')[0];
                await client.query(`ALTER TABLE ficha_tecnica ADD COLUMN IF NOT EXISTS ${col}`);
            } catch (err) {
                // Ignore if already exists in some pg versions
            }
        }

        console.log('✅ Tabela ficha_tecnica preparada no Postgres.');
    } catch (e) {
        console.error('❌ Erro ao preparar tabela no Postgres:', e);
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
                F.CLI_CODIGO_FIC,
                F.MODELO_FIC,
                F.CAVIDADE_PESO_BOLO_FIC,
                F.QTDE_CAIXAS_MACHO_FIC,
                F.PINTAR_PISTOLA_FIC,
                F.PINTAR_IMERSAO_FIC,
                F.FORNECIMENTO_FIC,
                F.PESO_PENCA_FIC,
                F.PESO_UNITARIO_COM_ALIMENT_FIC,
                F.PESO_UNITARIO_SEM_ALIMENT_FIC,
                F.RELACAO_MOLDE_METAL_FIC,
                F.PESO_TAMPA_FIC,
                F.PESO_FUNDO_FIC,
                F.CAVIDADE_QTDE_FIGURAS_FIC,
                F.TIPO_MODELO_FIC,
                P.NOME_PRO,
                P.PESO_LIQUIDO_PRO,
                P.PESO_BRUTO_PRO,
                P.UNIDADE_PRO,
                P.NCM_PRO,
                P.SITUACAO_PRO,
                M.MATERIAL_MAT as NOME_MATERIAL,
                C.RAZAO_SOCIAL_CLI as NOME_CLIENTE
            FROM FICHA_TECNICA F
            LEFT JOIN PRODUTO P ON P.CODIGO_PRO = F.PRO_CODIGO_FIC
            LEFT JOIN PRODUTO_MATERIAL PM ON PM.PRODUTO_PMT = P.CODIGO_PRO
            LEFT JOIN MATERIAL M ON M.ID_MAT = PM.MAT_ID_PMT
            LEFT JOIN CLIENTE C ON C.CODIGO_CLI = F.CLI_CODIGO_FIC
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
                    // Transformação de Pintura
                    let pintura = '-';
                    if (String(row.PINTAR_PISTOLA_FIC).trim() === 'S') pintura = 'PISTOLA';
                    else if (String(row.PINTAR_IMERSAO_FIC).trim() === 'S') pintura = 'IMERSAO';

                    // Transformação de Fornecimento
                    const fornMap = { 'BT': 'BRUTO', 'PU': 'PRÉ-USINADO', 'US': 'USINADO', 'FJ': 'FORJADO', 'FB': 'FABRICADO' };
                    const fornecimento = fornMap[String(row.FORNECIMENTO_FIC).trim()] || row.FORNECIMENTO_FIC || '-';

                    // Transformação de Tipo de Modelo
                    const modelMap = { 0: 'MODELO EM CAIXA', 1: 'MODELO EM PLACA', 2: 'MODELO SOLTO' };
                    const tipoModelo = modelMap[row.TIPO_MODELO_FIC] || '-';

                    await client.query(`
                        INSERT INTO ficha_tecnica (
                            pro_codigo_fic, material_fic, peso_liquido_fic, peso_unit_pcp_fic,
                            tipo_moldagem_desc_fic, operacao_moldagem_desc_fic, desenho_int_data_rev_fic,
                            descricao_fic, nome_pro, peso_liquido_pro, peso_bruto_pro, unidade_pro,
                            ncm_pro, situacao_pro, nome_material, cliente_nome, modelo_fic,
                            peso_bolo_fic, qtde_caixas_macho, pintura_tipo, fornecimento_desc,
                            peso_penca, peso_com_alimentacao, peso_sem_alimentacao, relacao_molde_metal,
                            peso_tampa, peso_fundo, qtde_figuras, tipo_modelo_desc, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW())
                        ON CONFLICT (pro_codigo_fic) DO UPDATE SET
                            material_fic = EXCLUDED.material_fic,
                            peso_liquido_fic = EXCLUDED.peso_liquido_fic,
                            peso_unit_pcp_fic = EXCLUDED.peso_unit_pcp_fic,
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
                            cliente_nome = EXCLUDED.cliente_nome,
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
                        row.NOME_MATERIAL,
                        row.NOME_CLIENTE,
                        row.MODELO_FIC,
                        row.CAVIDADE_PESO_BOLO_FIC,
                        row.QTDE_CAIXAS_MACHO_FIC,
                        pintura,
                        fornecimento,
                        row.PESO_PENCA_FIC,
                        row.PESO_UNITARIO_COM_ALIMENT_FIC,
                        row.PESO_UNITARIO_SEM_ALIMENT_FIC,
                        row.RELACAO_MOLDE_METAL_FIC,
                        row.PESO_TAMPA_FIC,
                        row.PESO_FUNDO_FIC,
                        row.CAVIDADE_QTDE_FIGURAS_FIC,
                        tipoModelo
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
