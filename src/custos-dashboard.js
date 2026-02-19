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

        // 1. Produção FUSÃO no mês (KPI principal)
        // JOIN com produto_pesos_producao para pesos corrigidos (mesmo que apontamentos_produtivos.html)
        const fusaoRes = await pool.query(`
            SELECT 
                COALESCE(SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), p.peso, 0)), 0) as peso_total
            FROM producao_apontada_sincronizada t
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            WHERE t.data_producao >= $1 AND t.data_producao < $2
              AND UPPER(t.setor) = 'FUSAO'
        `, [startDate, endDate]);
        const producaoFusaoKg = parseFloat(fusaoRes.rows[0].peso_total || 0);

        // 2. Produção por setor (para gráfico)
        const producaoSetoresRes = await pool.query(`
            SELECT 
                t.setor,
                SUM(t.quantidade) as qty,
                SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), p.peso, 0)) as peso_total
            FROM producao_apontada_sincronizada t
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            WHERE t.data_producao >= $1 AND t.data_producao < $2
            GROUP BY t.setor
            ORDER BY peso_total DESC
        `, [startDate, endDate]);

        // 3. Faturamento do mês — mesma lógica do faturamentos.html
        // Peso = SUM(peso_total), Valor = SUM(valor_unitario * quantidade * 100)
        // Exclui registros excluídos manualmente e via preferências
        const fatRes = await pool.query(`
            SELECT 
                COALESCE(SUM(f.peso_total), 0) as fat_peso,
                COALESCE(SUM(f.valor_unitario * f.quantidade * 100), 0) as fat_valor
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            WHERE f.data_faturamento >= $1 AND f.data_faturamento < $2
              AND COALESCE(p.excluido, f.excluido_manualmente, false) = false
        `, [startDate, endDate]);

        const faturamentoKg = parseFloat(fatRes.rows[0].fat_peso || 0);
        const faturamentoValor = parseFloat(fatRes.rows[0].fat_valor || 0);

        // 4. Carteira (snapshot atual)
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
        const custoPerKg = producaoFusaoKg > 0 ? custoTotal / producaoFusaoKg : 0;

        // 6. Evolução mensal (12 meses):
        //    Produção = FUSÃO com pesos corrigidos
        //    Faturamento = peso_total de faturamento_firebird (mesma lógica do faturamentos.html)
        const evolucaoFusaoRes = await pool.query(`
            SELECT 
                EXTRACT(MONTH FROM t.data_producao) as mes,
                SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), p.peso, 0)) as producao_kg
            FROM producao_apontada_sincronizada t
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            WHERE EXTRACT(YEAR FROM t.data_producao) = $1
              AND UPPER(t.setor) = 'FUSAO'
            GROUP BY EXTRACT(MONTH FROM t.data_producao)
            ORDER BY mes
        `, [year]);

        const fatEvolucaoRes = await pool.query(`
            SELECT 
                EXTRACT(MONTH FROM f.data_faturamento) as mes,
                COALESCE(SUM(f.peso_total), 0) as fat_kg
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            WHERE EXTRACT(YEAR FROM f.data_faturamento) = $1
              AND COALESCE(p.excluido, f.excluido_manualmente, false) = false
            GROUP BY EXTRACT(MONTH FROM f.data_faturamento)
            ORDER BY mes
        `, [year]);

        // Merge into 12-month array
        const evolucaoMensal = [];
        for (let m = 1; m <= 12; m++) {
            const prod = evolucaoFusaoRes.rows.find(r => parseInt(r.mes) === m);
            const fat = fatEvolucaoRes.rows.find(r => parseInt(r.mes) === m);
            evolucaoMensal.push({
                mes: m,
                producaoKg: parseFloat(prod?.producao_kg || 0),
                faturamentoKg: parseFloat(fat?.fat_kg || 0)
            });
        }

        // 7. Top 5 ligas (mês selecionado)
        const ligasRes = await pool.query(`
            SELECT 
                COALESCE(NULLIF(TRIM(t.liga), ''), 'Sem Liga') as liga,
                SUM(t.quantidade) as qty,
                SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), p.peso, 0)) as peso_total
            FROM producao_apontada_sincronizada t
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            WHERE t.data_producao >= $1 AND t.data_producao < $2
              AND t.liga IS NOT NULL AND TRIM(t.liga) != ''
            GROUP BY TRIM(t.liga)
            ORDER BY peso_total DESC
            LIMIT 5
        `, [startDate, endDate]);

        res.json({
            success: true,
            data: {
                // KPIs
                producaoFusaoKg: Math.round(producaoFusaoKg),
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
