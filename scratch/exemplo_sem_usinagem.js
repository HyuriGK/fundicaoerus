const pool = require('../lib/db');
(async () => {
    try {
        const r = await pool.query(`
            SELECT 
                data->>'OP_PCS' as op,
                data->>'PRODUTO_PPR' as cod,
                data->>'NOME_PRODUTO_PPR' as nome,
                COALESCE((data->>'QTY_TT')::numeric, 0) as tt,
                COALESCE((data->>'QTY_USINAGEM')::numeric, 0) as usinagem,
                COALESCE((data->>'QTY_QUALIDADE')::numeric, 0) as qualidade,
                COALESCE((data->>'QTY_EXPEDICAO')::numeric, 0) as expedicao,
                COALESCE((data->>'QTY_FATURAMENTO')::numeric, 0) as faturamento,
                data->>'FATURADO_PPR' as faturado
            FROM firebird_sync_emissoes
            WHERE data->>'OP_PCS' IS NOT NULL
              AND TRIM(data->>'OP_PCS') != ''
              AND TRIM(data->>'OP_PCS') != '-'
              AND COALESCE((data->>'QTY_TT')::numeric, 0) > 0
              AND COALESCE((data->>'QTY_USINAGEM')::numeric, 0) = 0
            ORDER BY COALESCE((data->>'QTY_TT')::numeric, 0) DESC
            LIMIT 5
        `);

        console.log(`\n==================================================================`);
        console.log(`  EXEMPLOS DE PEÇAS QUE PULARAM USINAGEM E FORAM P/ QUALIDADE`);
        console.log(`==================================================================\n`);

        r.rows.forEach((x, i) => {
            console.log(`EXEMPLO ${i+1}: OP ${x.op} | Cód: ${x.cod}`);
            console.log(`Produto: ${(x.nome||'').substring(0,60)}`);
            console.log(`Status de Faturamento: ${x.faturado === 'T    ' ? 'Faturado/Embarcado' : 'Em carteira'}`);
            console.log(`Rastreio do ERP:`);
            console.log(`   🔸 Tratamento Térmico (Apontado): ${x.tt} pçs`);
            console.log(`   🔹 Usinagem (Apontado):           ${x.usinagem} pçs  <-- PULO NO ROTEIRO!`);
            console.log(`   🔸 Qualidade (Apontado):          ${x.qualidade} pçs`);
            console.log(`   🔸 Expedição (Apontado):          ${x.expedicao} pçs`);
            console.log(`   🔸 Faturamento (Apontado):        ${x.faturamento} pçs`);
            console.log('');
        });
    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
})();
