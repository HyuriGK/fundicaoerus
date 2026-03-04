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

async function syncFichas() {
    console.log('🚀 Sincronização de Fichas Técnicas (Otimizada)...');
    const client = await pgPool.connect();

    Firebird.attach(firebirdOptions, function (err, db) {
        if (err) { console.error('Erro Firebird:', err); client.release(); return; }

        const sql = `
            SELECT 
                F.PRO_CODIGO_FIC, F.MAT_NOMENCLATURA_FIC, F.PESO_LIQUIDO_FIC, F.PESO_UNIT_PCP_FIC,
                F.TIPO_MOLDAGEM_DESC_FIC, F.OPERACAO_MOLDAGEM_DESC_FIC,
                F.DESCRICAO_FIC, F.CLI_CODIGO_FIC, F.MODELO_FIC, F.CAVIDADE_PESO_BOLO_FIC,
                F.QTDE_CAIXAS_MACHO_FIC, F.PINTAR_PISTOLA_FIC, F.PINTAR_IMERSAO_FIC,
                F.FORNECIMENTO_FIC, F.PESO_PENCA_FIC, F.PESO_UNITARIO_COM_ALIMENT_FIC,
                F.PESO_UNITARIO_SEM_ALIMENT_FIC, F.RELACAO_MOLDE_METAL_FIC,
                F.PESO_TAMPA_FIC, F.PESO_FUNDO_FIC, F.CAVIDADE_QTDE_FIGURAS_FIC, F.TIPO_MODELO_FIC,
                P.NOME_PRO, P.PESO_LIQUIDO_PRO, P.PESO_BRUTO_PRO, P.SITUACAO_PRO,
                C.RAZAO_SOCIAL_CLI as NOME_CLIENTE
            FROM FICHA_TECNICA F
            LEFT JOIN PRODUTO P ON P.CODIGO_PRO = F.PRO_CODIGO_FIC
            LEFT JOIN CLIENTE C ON C.CODIGO_CLI = F.CLI_CODIGO_FIC
        `;

        console.log('📥 Executando query no Firebird...');
        db.query(sql, async function (err, results) {
            if (err) { console.error('Erro query:', err); db.detach(); client.release(); return; }

            console.log(`📊 ${results.length} registros recebidos. Iniciando processamento...`);
            let count = 0;
            for (const row of results) {
                try {
                    const pintura = String(row.PINTAR_PISTOLA_FIC).trim() === 'S' ? 'PISTOLA' : (String(row.PINTAR_IMERSAO_FIC).trim() === 'S' ? 'IMERSAO' : '-');
                    const fornMap = { 'BT': 'BRUTO', 'PU': 'PRÉ-USINADO', 'US': 'USINADO', 'FJ': 'FORJADO', 'FB': 'FABRICADO' };
                    const fornecimento = fornMap[String(row.FORNECIMENTO_FIC).trim()] || row.FORNECIMENTO_FIC || '-';
                    const modelMap = { 0: 'MODELO EM CAIXA', 1: 'MODELO EM PLACA', 2: 'MODELO SOLTO' };
                    const tipoModelo = modelMap[row.TIPO_MODELO_FIC] || '-';

                    // Conforme solicitado: RELACAO_MOLDE_METAL_FIC estrito
                    const relacao = row.RELACAO_MOLDE_METAL_FIC || 0;

                    await client.query(`
                        INSERT INTO ficha_tecnica (
                            pro_codigo_fic, material_fic, peso_liquido_fic, peso_unit_pcp_fic,
                            tipo_moldagem_desc_fic, operacao_moldagem_desc_fic,
                            descricao_fic, nome_pro, peso_liquido_pro, peso_bruto_pro,
                            situacao_pro, cliente_nome, cli_codigo_fic, cli_codgio_fic,
                            modelo_fic, peso_bolo_fic, qtde_caixas_macho, pintura_tipo, fornecimento_desc,
                            peso_penca, peso_com_alimentacao, peso_sem_alimentacao, relacao_molde_metal,
                            peso_tampa, peso_fundo, qtde_figuras, tipo_modelo_desc, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW())
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
                            updated_at = NOW();
                    `, [
                        String(row.PRO_CODIGO_FIC).trim(), row.MAT_NOMENCLATURA_FIC, row.PESO_LIQUIDO_FIC, row.PESO_UNIT_PCP_FIC,
                        row.TIPO_MOLDAGEM_DESC_FIC, row.OPERACAO_MOLDAGEM_DESC_FIC, row.DESCRICAO_FIC,
                        row.NOME_PRO, row.PESO_LIQUIDO_PRO, row.PESO_BRUTO_PRO, row.SITUACAO_PRO,
                        row.NOME_CLIENTE, String(row.CLI_CODIGO_FIC).trim(), String(row.CLI_CODIGO_FIC).trim(),
                        row.MODELO_FIC, row.CAVIDADE_PESO_BOLO_FIC, row.QTDE_CAIXAS_MACHO_FIC, pintura, fornecimento,
                        row.PESO_PENCA_FIC, row.PESO_UNITARIO_COM_ALIMENT_FIC, row.PESO_UNITARIO_SEM_ALIMENT_FIC, relacao,
                        row.PESO_TAMPA_FIC, row.PESO_FUNDO_FIC, row.CAVIDADE_QTDE_FIGURAS_FIC, tipoModelo
                    ]);
                    count++;
                } catch (e) {
                    // console.error('Erro row:', e.message);
                }
            }
            console.log(`✅ Sincronização concluída: ${count} registros.`);
            db.detach(); client.release(); await pgPool.end();
        });
    });
}
syncFichas();
