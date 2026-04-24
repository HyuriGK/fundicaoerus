/**
 * Script para verificar OPs que tem apontamentos em Tratamento Térmico (TT)
 * mas não tem nas etapas seguintes (Usinagem, Qualidade, Expedição, Faturamento)
 * Versão 2: Busca dados cruzados com carteira para pegar nome do produto
 */

const pool = require('../lib/db');

async function checkTTStages() {
    try {
        console.log('🔍 Buscando OPs com apontamento em TT...\n');

        // Query all OPs from firebird_sync_pedidos that have QTY_TT > 0
        // Cross-join with emissoes to get product name
        const result = await pool.query(`
            SELECT 
                p.sync_key,
                COALESCE((p.data->>'QTY_TT')::numeric, 0) as qty_tt,
                COALESCE((p.data->>'QTY_USINAGEM')::numeric, 0) as qty_usinagem,
                COALESCE((p.data->>'QTY_QUALIDADE')::numeric, 0) as qty_qualidade,
                COALESCE((p.data->>'QTY_EXPEDICAO')::numeric, 0) as qty_expedicao,
                COALESCE((p.data->>'QTY_FATURAMENTO')::numeric, 0) as qty_faturamento,
                COALESCE((p.data->>'QTY_ACABAMENTO')::numeric, 0) as qty_acabamento,
                COALESCE((p.data->>'QTY_FUSAO')::numeric, 0) as qty_fusao,
                COALESCE((p.data->>'QTY_MOLDADA')::numeric, 0) as qty_moldada,
                p.data->>'NOME_PRODUTO' as produto,
                p.data->>'NOME_CLIENTE' as cliente,
                p.data->>'OP_QUANTIDADE' as op_quantidade,
                p.data->>'PRODUTO_PPR' as cod_produto,
                p.data->>'ANDAMENTO_PCS' as andamento
            FROM firebird_sync_pedidos p
            WHERE p.sync_key LIKE 'OP-%'
              AND COALESCE((p.data->>'QTY_TT')::numeric, 0) > 0
            ORDER BY p.sync_key
        `);

        console.log(`Total de OPs com TT > 0: ${result.rows.length}\n`);

        // Also get product names from emissoes
        const emissoes = await pool.query(`
            SELECT DISTINCT 
                data->>'OP_PCS' as op,
                data->>'NOME_PRODUTO_PPR' as nome_produto,
                data->>'PRODUTO_PPR' as cod_produto
            FROM firebird_sync_emissoes
            WHERE data->>'OP_PCS' IS NOT NULL
              AND data->>'OP_PCS' != ''
              AND data->>'OP_PCS' != '-'
        `);

        const produtoByOP = {};
        emissoes.rows.forEach(r => {
            produtoByOP[r.op] = { nome: r.nome_produto, codigo: r.cod_produto };
        });

        // Filter: OPs that have TT but are missing from subsequent stages
        const missing = result.rows.filter(row => {
            const tt = parseFloat(row.qty_tt) || 0;
            const usinagem = parseFloat(row.qty_usinagem) || 0;
            const qualidade = parseFloat(row.qty_qualidade) || 0;
            const expedicao = parseFloat(row.qty_expedicao) || 0;
            const faturamento = parseFloat(row.qty_faturamento) || 0;
            return tt > 0 && usinagem === 0 && qualidade === 0 && expedicao === 0 && faturamento === 0;
        });

        console.log(`========================================================`);
        console.log(`OPs COM TT mas SEM NENHUMA etapa seguinte: ${missing.length}`);
        console.log(`========================================================\n`);

        if (missing.length > 0) {
            missing.forEach(row => {
                const op = row.sync_key.replace('OP-', '');
                const prod = produtoByOP[op] || {};
                console.log(`OP: ${op} | Cód: ${row.cod_produto || prod.codigo || '-'} | Produto: ${prod.nome || row.produto || '-'}`);
                console.log(`  Cliente: ${row.cliente || '-'} | Qtd OP: ${row.op_quantidade || '-'}`);
                console.log(`  Moldada: ${row.qty_moldada} | Fusão: ${row.qty_fusao} | Acabamento: ${row.qty_acabamento} | TT: ${row.qty_tt}`);
                console.log(`  Usinagem: ${row.qty_usinagem} | Qualidade: ${row.qty_qualidade} | Expedição: ${row.qty_expedicao} | Faturamento: ${row.qty_faturamento}`);
                console.log('');
            });
        } else {
            console.log('✅ Nenhuma OP encontrada nesta situação.\n');
        }

        // Partial: OPs that have TT but subsequent stages have LESS quantity
        const partial = result.rows.filter(row => {
            const tt = parseFloat(row.qty_tt) || 0;
            const usinagem = parseFloat(row.qty_usinagem) || 0;
            const qualidade = parseFloat(row.qty_qualidade) || 0;
            const expedicao = parseFloat(row.qty_expedicao) || 0;
            const faturamento = parseFloat(row.qty_faturamento) || 0;
            const maxSubsequent = Math.max(usinagem, qualidade, expedicao, faturamento);
            return tt > 0 && maxSubsequent > 0 && maxSubsequent < tt;
        });

        console.log(`========================================================`);
        console.log(`OPs COM TT e etapas seguintes PARCIAIS (qty < TT): ${partial.length}`);
        console.log(`========================================================\n`);

        if (partial.length > 0) {
            partial.forEach(row => {
                const op = row.sync_key.replace('OP-', '');
                const prod = produtoByOP[op] || {};
                const tt = parseFloat(row.qty_tt);
                const maxSub = Math.max(
                    parseFloat(row.qty_usinagem) || 0,
                    parseFloat(row.qty_qualidade) || 0,
                    parseFloat(row.qty_expedicao) || 0,
                    parseFloat(row.qty_faturamento) || 0
                );
                const diff = tt - maxSub;
                console.log(`OP: ${op} | Cód: ${row.cod_produto || prod.codigo || '-'} | ${prod.nome || row.produto || '-'}`);
                console.log(`  Cliente: ${row.cliente || '-'}`);
                console.log(`  TT: ${row.qty_tt} | Usinagem: ${row.qty_usinagem} | Qualidade: ${row.qty_qualidade} | Expedição: ${row.qty_expedicao} | Faturamento: ${row.qty_faturamento}`);
                console.log(`  ⚠️  Diferença: ${diff} peças com TT que não avançaram para as etapas seguintes`);
                console.log('');
            });
        }

        // Summary
        console.log(`\n========================================================`);
        console.log(`RESUMO:`);
        console.log(`  Total OPs com TT: ${result.rows.length}`);
        console.log(`  😎 Completas (seguintes >= TT): ${result.rows.length - missing.length - partial.length}`);
        console.log(`  ⚠️  Parciais (etapas seguintes < TT): ${partial.length}`);
        console.log(`  🚨 Paradas no TT (sem etapas seguintes): ${missing.length}`);
        console.log(`========================================================\n`);

    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
}

checkTTStages();
