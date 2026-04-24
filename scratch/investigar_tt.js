/**
 * Investigação: Por que kpiTT=0 na simulação com firebird_sync_emissoes?
 * Compara os dados de QTY_TT entre emissoes e pedidos (por OP)
 */
const pool = require('../lib/db');

async function investigar() {
    try {
        // Buscar itens NÃO faturados do emissoes que tem OP
        const emissoes = await pool.query(`
            SELECT 
                data->>'OP_PCS' as op,
                data->>'PRODUTO_PPR' as cod,
                data->>'NOME_PRODUTO_PPR' as nome,
                COALESCE((data->>'QTY_TT')::numeric, 0) as qty_tt,
                COALESCE((data->>'QTY_USINAGEM')::numeric, 0) as qty_usinagem,
                COALESCE((data->>'QTY_QUALIDADE')::numeric, 0) as qty_qualidade,
                COALESCE((data->>'QTY_EXPEDICAO')::numeric, 0) as qty_expedicao,
                COALESCE((data->>'QTY_FATURAMENTO')::numeric, 0) as qty_faturamento,
                data->>'FATURADO_PPR' as faturado
            FROM firebird_sync_emissoes
            WHERE COALESCE(data->>'FATURADO_PPR', '') != 'T'
              AND data->>'OP_PCS' IS NOT NULL
              AND data->>'OP_PCS' != ''
              AND data->>'OP_PCS' != '-'
        `);

        console.log(`Itens em firebird_sync_emissoes (não faturados, com OP): ${emissoes.rows.length}\n`);

        // Quantos tem QTY_TT > 0?
        const comTT = emissoes.rows.filter(r => parseFloat(r.qty_tt) > 0);
        console.log(`Itens com QTY_TT > 0: ${comTT.length}`);

        // Quantos tem QTY_TT = null/0?
        const semTT = emissoes.rows.filter(r => !r.qty_tt || parseFloat(r.qty_tt) === 0);
        console.log(`Itens com QTY_TT = 0 ou null: ${semTT.length}`);

        // Verificar: os dados de QTY_* estão populados nas emissões?
        const sample = emissoes.rows.slice(0, 5);
        console.log(`\n--- Amostra de 5 itens (emissoes) ---`);
        sample.forEach(r => {
            console.log(`OP: ${r.op} | ${r.cod} | TT: ${r.qty_tt} | Usinagem: ${r.qty_usinagem} | Qual: ${r.qty_qualidade} | Exp: ${r.qty_expedicao}`);
        });

        // Agora comparar com firebird_sync_pedidos para as mesmas OPs
        console.log(`\n--- Comparação emissoes vs pedidos para OPs com TT>0 (pedidos) ---\n`);
        
        const pedidos = await pool.query(`
            SELECT 
                sync_key,
                COALESCE((data->>'QTY_TT')::numeric, 0) as qty_tt,
                COALESCE((data->>'QTY_USINAGEM')::numeric, 0) as qty_usinagem,
                COALESCE((data->>'QTY_QUALIDADE')::numeric, 0) as qty_qualidade,
                COALESCE((data->>'QTY_EXPEDICAO')::numeric, 0) as qty_expedicao
            FROM firebird_sync_pedidos
            WHERE sync_key LIKE 'OP-%'
              AND COALESCE((data->>'QTY_TT')::numeric, 0) > 0
            LIMIT 10
        `);

        for (const ped of pedidos.rows) {
            const opNum = ped.sync_key.replace('OP-', '');
            const emissao = emissoes.rows.find(r => r.op === opNum);
            console.log(`OP ${opNum}:`);
            console.log(`  PEDIDOS:  TT=${ped.qty_tt} Usin=${ped.qty_usinagem} Qual=${ped.qty_qualidade} Exp=${ped.qty_expedicao}`);
            if (emissao) {
                console.log(`  EMISSOES: TT=${emissao.qty_tt} Usin=${emissao.qty_usinagem} Qual=${emissao.qty_qualidade} Exp=${emissao.qty_expedicao}`);
            } else {
                console.log(`  EMISSOES: ❌ Não encontrado (ou já faturado)`);
            }
            console.log('');
        }

        // Verificar se QTY_TT existe como campo nos emissões
        console.log(`\n--- Verificação: campos QTY_* existem nos emissões? ---`);
        const fieldCheck = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN data ? 'QTY_TT' THEN 1 END) as has_qty_tt,
                COUNT(CASE WHEN data ? 'QTY_USINAGEM' THEN 1 END) as has_qty_usinagem,
                COUNT(CASE WHEN data ? 'QTY_MOLDADA' THEN 1 END) as has_qty_moldada,
                COUNT(CASE WHEN data ? 'QTY_FUSAO' THEN 1 END) as has_qty_fusao,
                COUNT(CASE WHEN data ? 'QTY_ACABAMENTO' THEN 1 END) as has_qty_acabamento,
                COUNT(CASE WHEN data ? 'QTY_QUALIDADE' THEN 1 END) as has_qty_qualidade,
                COUNT(CASE WHEN data ? 'QTY_EXPEDICAO' THEN 1 END) as has_qty_expedicao,
                COUNT(CASE WHEN data ? 'QTY_FATURAMENTO' THEN 1 END) as has_qty_faturamento
            FROM firebird_sync_emissoes
        `);
        console.log(JSON.stringify(fieldCheck.rows[0], null, 2));

    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
}

investigar();
