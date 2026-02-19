// src/custos-dashboard.js
// Endpoint consolidado para o Painel de Produção (custos.html)
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

router.get('/', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

        // Use first-of-next-month (exclusive) to avoid invalid dates like Feb 31
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        // 1. Produção por setor (mês selecionado)
        const producaoSetoresRes = await pool.query(`
            SELECT 
                setor,
                SUM(quantidade) as qty,
                SUM(quantidade * COALESCE(NULLIF(peso_un, 0), 0)) as peso_total
            FROM producao_apontada_sincronizada
            WHERE data_producao >= $1 AND data_producao < $2
            GROUP BY setor
            ORDER BY peso_total DESC
        `, [startDate, endDate]);

        // 2. Produção total do mês
        const producaoTotalKg = producaoSetoresRes.rows.reduce((sum, r) => sum + parseFloat(r.peso_total || 0), 0);

        // 3. Faturamento do mês (não excluídos manualmente)
        const fatRes = await pool.query(`
            SELECT 
                COALESCE(SUM(peso_total), 0) as fat_peso,
                COALESCE(SUM(valor_total), 0) as fat_valor
            FROM faturamento_firebird
            WHERE data_faturamento >= $1 AND data_faturamento < $2
              AND (excluido_manualmente IS NULL OR excluido_manualmente = false)
        `, [startDate, endDate]);

        const faturamentoKg = parseFloat(fatRes.rows[0].fat_peso || 0);
        const faturamentoValor = parseFloat(fatRes.rows[0].fat_valor || 0);

        // 4. Carteira (snapshot atual, sem filtro de data)
        const carteiraRes = await pool.query(`
            SELECT 
                COUNT(*) as total_pedidos,
                COALESCE(SUM(CAST(peso_total AS NUMERIC)), 0) as peso_total,
                COALESCE(SUM(CAST(saldo AS NUMERIC) * CAST(NULLIF(peso_un, '0') AS NUMERIC)), 0) as saldo_peso
            FROM carteira
        `);
        const carteiraPeso = parseFloat(carteiraRes.rows[0].saldo_peso || 0);
        const carteiraPedidos = parseInt(carteiraRes.rows[0].total_pedidos || 0);

        // 5. Custos do mês
        const custosRes = await pool.query(`
            SELECT COALESCE(SUM(valor), 0) as custo_total
            FROM custos_lancamentos
            WHERE EXTRACT(MONTH FROM data_iso) = $1 AND EXTRACT(YEAR FROM data_iso) = $2
        `, [month, year]);
        const custoTotal = parseFloat(custosRes.rows[0].custo_total || 0);
        const custoPerKg = producaoTotalKg > 0 ? custoTotal / producaoTotalKg : 0;

        // 6. Evolução mensal (12 meses do ano)
        const evolucaoRes = await pool.query(`
            SELECT 
                EXTRACT(MONTH FROM data_producao) as mes,
                SUM(quantidade * COALESCE(NULLIF(peso_un, 0), 0)) as producao_kg
            FROM producao_apontada_sincronizada
            WHERE EXTRACT(YEAR FROM data_producao) = $1
            GROUP BY EXTRACT(MONTH FROM data_producao)
            ORDER BY mes
        `, [year]);

        const fatEvolucaoRes = await pool.query(`
            SELECT 
                EXTRACT(MONTH FROM data_faturamento) as mes,
                COALESCE(SUM(peso_total), 0) as fat_kg,
                COALESCE(SUM(valor_total), 0) as fat_valor
            FROM faturamento_firebird
            WHERE EXTRACT(YEAR FROM data_faturamento) = $1
              AND (excluido_manualmente IS NULL OR excluido_manualmente = false)
            GROUP BY EXTRACT(MONTH FROM data_faturamento)
            ORDER BY mes
        `, [year]);

        // Merge into 12-month array
        const evolucaoMensal = [];
        for (let m = 1; m <= 12; m++) {
            const prod = evolucaoRes.rows.find(r => parseInt(r.mes) === m);
            const fat = fatEvolucaoRes.rows.find(r => parseInt(r.mes) === m);
            evolucaoMensal.push({
                mes: m,
                producaoKg: parseFloat(prod?.producao_kg || 0),
                faturamentoKg: parseFloat(fat?.fat_kg || 0),
                faturamentoValor: parseFloat(fat?.fat_valor || 0)
            });
        }

        // 7. Top 5 ligas mais produzidas (mês selecionado)
        const ligasRes = await pool.query(`
            SELECT 
                COALESCE(NULLIF(TRIM(liga), ''), 'Sem Liga') as liga,
                SUM(quantidade) as qty,
                SUM(quantidade * COALESCE(NULLIF(peso_un, 0), 0)) as peso_total
            FROM producao_apontada_sincronizada
            WHERE data_producao >= $1 AND data_producao < $2
              AND liga IS NOT NULL AND TRIM(liga) != ''
            GROUP BY TRIM(liga)
            ORDER BY peso_total DESC
            LIMIT 5
        `, [startDate, endDate]);

        res.json({
            success: true,
            data: {
                // KPIs
                producaoTotalKg: Math.round(producaoTotalKg),
                faturamentoKg: Math.round(faturamentoKg),
                faturamentoValor: Math.round(faturamentoValor * 100) / 100,
                carteiraPeso: Math.round(carteiraPeso),
                carteiraPedidos,
                custoTotal: Math.round(custoTotal * 100) / 100,
                custoPerKg: Math.round(custoPerKg * 100) / 100,

                // Arrays
                producaoSetores: producaoSetoresRes.rows.map(r => ({
                    setor: r.setor,
                    qty: parseFloat(r.qty),
                    pesoTotal: Math.round(parseFloat(r.peso_total || 0))
                })),
                evolucaoMensal,
                topLigas: ligasRes.rows.map(r => ({
                    liga: r.liga,
                    qty: parseFloat(r.qty),
                    pesoTotal: Math.round(parseFloat(r.peso_total || 0))
                }))
            }
        });

    } catch (error) {
        console.error('❌ Erro no custos-dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
