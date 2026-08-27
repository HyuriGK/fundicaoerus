const pool = require('../../lib/db');
const { publishDashboardSnapshot } = require('../../lib/dashboard-snapshot');

(async () => {
    const result = await pool.query(`
        SELECT
            UPPER(TRIM(t.setor)) AS setor,
            COALESCE(SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0)), 0) AS peso_total
        FROM producao_apontada_sincronizada t
        LEFT JOIN pesos_customizados pc ON t.codigo_peca = pc.codigo
        LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
        WHERE t.data_producao >= date_trunc('month', CURRENT_DATE)
          AND t.data_producao < date_trunc('month', CURRENT_DATE) + interval '1 month'
          AND TRIM(t.codigo_peca) NOT IN ('18358', '801032102')
        GROUP BY 1
    `);

    const totals = {
        'MOLDAGEM GERAL': 0, 'MOLDAGEM LEVE': 0, 'MOLDAGEM MANUAL': 0, 'MOLDAGEM PESADA': 0,
        FUSAO: 0, ACABAMENTO: 0, 'TRATAMENTO TERMICO': 0, 'USINAGEM EXPEDICAO': 0,
        'INSPECAO DE QUALIDADE': 0, EXPEDICAO: 0
    };

    result.rows.forEach(row => {
        const setor = String(row.setor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normalizado = setor === 'FUNDICAO' ? 'FUSAO'
            : setor === 'TT' ? 'TRATAMENTO TERMICO'
            : setor === 'QUALIDADE' ? 'INSPECAO DE QUALIDADE'
            : setor === 'USINAGEM' ? 'USINAGEM EXPEDICAO'
            : setor === 'REBARBACAO' ? 'ACABAMENTO' : setor;
        const peso = Number(row.peso_total) || 0;
        if (['MOLDAGEM LEVE', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA'].includes(normalizado)) {
            totals[normalizado] += peso;
            totals['MOLDAGEM GERAL'] += peso;
        } else if (Object.prototype.hasOwnProperty.call(totals, normalizado)) {
            totals[normalizado] += peso;
        }
    });

    await publishDashboardSnapshot('producao_setores', {
        monthKey: new Date().toISOString().slice(0, 7),
        totals
    });
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
