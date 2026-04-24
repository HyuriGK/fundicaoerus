const pool = require('../lib/db');
(async () => {
    try {
        const r = await pool.query(`
            SELECT 
                data->>'OP_PCS' as op,
                data->>'PRODUTO_PPR' as cod,
                data->>'NOME_PRODUTO_PPR' as nome,
                data->>'NOME_CLIENTE' as cliente,
                COALESCE((data->>'QTY_ACABAMENTO')::numeric, 0) as acabamento,
                COALESCE((data->>'QTY_TT')::numeric, 0) as tt,
                COALESCE((data->>'QTY_USINAGEM')::numeric, 0) as usinagem,
                COALESCE((data->>'QTY_QUALIDADE')::numeric, 0) as qualidade,
                COALESCE((data->>'QTY_EXPEDICAO')::numeric, 0) as expedicao,
                COALESCE((data->>'QTY_FATURAMENTO')::numeric, 0) as faturamento,
                COALESCE((data->>'OP_QUANTIDADE')::numeric, 0) as op_qtd,
                data->>'ENTREGA_PETR' as entrega
            FROM firebird_sync_emissoes
            WHERE TRIM(COALESCE(data->>'FATURADO_PPR', '')) != 'T'
              AND data->>'OP_PCS' IS NOT NULL
              AND TRIM(data->>'OP_PCS') != ''
              AND TRIM(data->>'OP_PCS') != '-'
              AND COALESCE((data->>'QTY_ACABAMENTO')::numeric, 0) > 0
              AND COALESCE((data->>'QTY_ACABAMENTO')::numeric, 0) > GREATEST(
                  COALESCE((data->>'QTY_TT')::numeric, 0),
                  COALESCE((data->>'QTY_USINAGEM')::numeric, 0),
                  COALESCE((data->>'QTY_QUALIDADE')::numeric, 0),
                  COALESCE((data->>'QTY_EXPEDICAO')::numeric, 0),
                  COALESCE((data->>'QTY_FATURAMENTO')::numeric, 0)
              )
            ORDER BY (COALESCE((data->>'QTY_ACABAMENTO')::numeric, 0) - GREATEST(
                  COALESCE((data->>'QTY_TT')::numeric, 0),
                  COALESCE((data->>'QTY_USINAGEM')::numeric, 0),
                  COALESCE((data->>'QTY_QUALIDADE')::numeric, 0),
                  COALESCE((data->>'QTY_EXPEDICAO')::numeric, 0),
                  COALESCE((data->>'QTY_FATURAMENTO')::numeric, 0)
              )) DESC
        `);

        console.log(`\n==================================================================`);
        console.log(`  OPs NA CARTEIRA ATIVA: ACABAMENTO maior que etapas seguintes`);
        console.log(`  (peças com acabamento que não avançaram para TT/Usin/Qual/Exp)`);
        console.log(`==================================================================\n`);

        if (r.rows.length === 0) {
            console.log('✅ Nenhuma OP encontrada nessa situação.\n');
        } else {
            let totalParadas = 0;
            r.rows.forEach((x, i) => {
                const maxSeguinte = Math.max(x.tt, x.usinagem, x.qualidade, x.expedicao, x.faturamento);
                const paradas = x.acabamento - maxSeguinte;
                totalParadas += paradas;
                const entrega = x.entrega ? new Date(x.entrega).toLocaleDateString('pt-BR') : 'Sem data';
                console.log(`${i+1}. OP ${x.op} — ${paradas} pçs paradas após Acabamento`);
                console.log(`   ${x.cod} | ${(x.nome||'').substring(0,55)}`);
                console.log(`   Cliente: ${x.cliente} | Entrega: ${entrega}`);
                console.log(`   Acab: ${x.acabamento} | TT: ${x.tt} | Usin: ${x.usinagem} | Qual: ${x.qualidade} | Exp: ${x.expedicao} | Fat: ${x.faturamento}`);
                console.log('');
            });
            console.log(`==================================================================`);
            console.log(`  TOTAL: ${r.rows.length} OPs | ${totalParadas} peças paradas após Acabamento`);
            console.log(`==================================================================\n`);
        }
    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
})();
