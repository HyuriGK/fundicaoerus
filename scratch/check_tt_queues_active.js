const pool = require('../lib/db');
(async () => {
    try {
        const r = await pool.query(`
            SELECT 
                data->>'OP_PCS' as op,
                data->>'ROTEIRO_PRODUCAO' as roteiro,
                COALESCE((data->>'QTY_TT')::numeric, 0) as raw_tt,
                COALESCE((data->>'QTY_USINAGEM')::numeric, 0) as raw_usinagem,
                COALESCE((data->>'QTY_QUALIDADE')::numeric, 0) as raw_qualidade,
                COALESCE((data->>'QTY_EXPEDICAO')::numeric, 0) as raw_expedicao,
                COALESCE((data->>'QTY_FATURAMENTO')::numeric, 0) as raw_faturamento,
                data->>'FATURADO_PPR' as faturado
            FROM firebird_sync_emissoes
            WHERE data->>'OP_PCS' IS NOT NULL
              AND TRIM(data->>'OP_PCS') != ''
              AND TRIM(data->>'OP_PCS') != '-'
              AND TRIM(data->>'FATURADO_PPR') != 'T'
        `);

        let qAguardandoQualidade = 0;
        let qAguardandoUsinagem = 0;

        r.rows.forEach(item => {
            const rawFat = Number(item.raw_faturamento);
            const rawExp = Number(item.raw_expedicao);
            const rawQual = Number(item.raw_qualidade);
            const rawUsi = Number(item.raw_usinagem);
            const rawTT = Number(item.raw_tt);

            const cExp = Math.max(rawFat, rawExp);
            const cQual = Math.max(cExp, rawQual);
            const cUsi = Math.max(cQual, rawUsi);
            const cTT = Math.max(cUsi, rawTT);

            const qTT = Math.max(0, cTT - cUsi);

            if (qTT > 0) {
                const isUsiRoute = String(item.roteiro || '').toUpperCase().includes('USINAGEM');
                if (isUsiRoute) {
                    qAguardandoUsinagem += qTT;
                } else {
                    qAguardandoQualidade += qTT;
                }
            }
        });

        console.log(`\n========= RESUMO CARTEIRA ATIVA =========`);
        console.log(`Peças em "Aguardando Usinagem Externa": ${qAguardandoUsinagem}`);
        console.log(`Peças em "Aguardando Qualidade": ${qAguardandoQualidade}`);
        console.log(`==========================================\n`);

    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
})();
