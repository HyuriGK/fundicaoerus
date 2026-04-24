const pool = require('../lib/db');
(async () => {
    try {
        const r = await pool.query(`
            SELECT 
                data->>'OP_PCS' as op,
                data->>'PRODUTO_PPR' as cod,
                data->>'NOME_PRODUTO_PPR' as nome,
                data->>'NOME_CLIENTE' as cliente,
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
              AND COALESCE((data->>'QTY_USINAGEM')::numeric, 0) > 0
              AND COALESCE((data->>'QTY_USINAGEM')::numeric, 0) > GREATEST(
                  COALESCE((data->>'QTY_QUALIDADE')::numeric, 0),
                  COALESCE((data->>'QTY_EXPEDICAO')::numeric, 0),
                  COALESCE((data->>'QTY_FATURAMENTO')::numeric, 0)
              )
            ORDER BY (COALESCE((data->>'QTY_USINAGEM')::numeric, 0) - GREATEST(
                  COALESCE((data->>'QTY_QUALIDADE')::numeric, 0),
                  COALESCE((data->>'QTY_EXPEDICAO')::numeric, 0),
                  COALESCE((data->>'QTY_FATURAMENTO')::numeric, 0)
              )) DESC
        `);

        console.log(`\n==================================================================`);
        console.log(`  PEÇAS EM PODER DE TERCEIROS (USINAGEM EXTERNA)`);
        console.log(`  Apontadas em "Usinagem" mas sem retorno (Qualidade/Exp/Fat)`);
        console.log(`==================================================================\n`);

        if (r.rows.length === 0) {
            console.log('✅ Nenhuma peça apontada em usinagem aguardando retorno ou a caminho dos próximos setores.\n');
        } else {
            let totalParadas = 0;
            r.rows.forEach((x, i) => {
                const maxSeguinte = Math.max(x.qualidade, x.expedicao, x.faturamento);
                const paradas = x.usinagem - maxSeguinte;
                totalParadas += paradas;
                const entrega = x.entrega ? new Date(x.entrega).toLocaleDateString('pt-BR') : 'Sem data';
                console.log(`${i+1}. OP ${x.op} — ${paradas} pçs atualmente fora (em usinagem externa)`);
                console.log(`   ${x.cod} | ${(x.nome||'').substring(0,55)}`);
                console.log(`   Cliente: ${x.cliente} | Entrega: ${entrega}`);
                console.log(`   Enviadas p/ Usin: ${x.usinagem} | Retornou (Qual/Exp/Fat Max): ${maxSeguinte}`);
                console.log(`   (Detalhe retorno: Qual=${x.qualidade} | Exp=${x.expedicao} | Fat=${x.faturamento})`);
                console.log('');
            });
            console.log(`==================================================================`);
            console.log(`  TOTAL: ${r.rows.length} OPs | ${totalParadas} peças atualmente em usinagem externa`);
            console.log(`==================================================================\n`);
        }
    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
})();
