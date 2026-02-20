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

        // Buscar clientes excluídos (mesma lógica do faturamentos.html)
        let excludedClients = [];
        try {
            const prefRes = await pool.query(`SELECT value FROM app_preferences WHERE key = 'excluded_clients'`);
            if (prefRes.rows.length > 0 && prefRes.rows[0].value) {
                excludedClients = typeof prefRes.rows[0].value === 'string' ? JSON.parse(prefRes.rows[0].value) : prefRes.rows[0].value;
            }
        } catch (e) { /* ignore if table doesn't exist */ }

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
        // Exclui registros excluídos manualmente, via preferências, e clientes excluídos
        let fatQuery = `
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
        `;
        const fatParams = [startDate, endDate];
        if (excludedClients.length > 0) {
            fatQuery += ` AND TRIM(f.cliente_nome) NOT IN (${excludedClients.map((_, i) => `$${i + 3}`).join(',')})`;
            fatParams.push(...excludedClients);
        }
        const fatRes = await pool.query(fatQuery, fatParams);

        const faturamentoKg = parseFloat(fatRes.rows[0].fat_peso || 0);
        const faturamentoValor = parseFloat(fatRes.rows[0].fat_valor || 0);

        // 4. Carteira (Cálculo dinâmico baseado no sincronismo e pesos customizados)
        let carteiraPeso = 0;
        let carteiraPedidos = 0;

        try {
            // A. Buscar pesos customizados
            const weightsRes = await pool.query('SELECT codigo, peso FROM pesos_customizados');
            const customWeights = {};
            weightsRes.rows.forEach(r => customWeights[r.codigo] = parseFloat(r.peso));

            // B. Buscar carteira mais atual sincronizada do Firebird
            const syncRes = await pool.query('SELECT data FROM firebird_sync_pedidos');
            const uniquePedidos = new Set();

            syncRes.rows.forEach(row => {
                const item = row.data;
                if (item.CODIGO_PPR) uniquePedidos.add(item.CODIGO_PPR);

                const saldoLiberado = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
                const qtdOriginal = Number(item.QUANTIDADE_PPR) || 0;
                const saldoReal = saldoLiberado > 0 ? saldoLiberado : qtdOriginal;

                let pesoUnitario = qtdOriginal > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / qtdOriginal : 0;

                if (customWeights[item.PRODUTO_PPR]) {
                    pesoUnitario = customWeights[item.PRODUTO_PPR];
                }

                carteiraPeso += (pesoUnitario * saldoReal);
            });

            carteiraPedidos = uniquePedidos.size;
        } catch (e) {
            console.error('Erro ao calcular carteira dinamica no dashboard:', e);
        }

        // 5. Custos do mês
        const custosRes = await pool.query(`
            SELECT COALESCE(SUM(valor), 0) as custo_total
            FROM custos_lancamentos
            WHERE EXTRACT(MONTH FROM data_iso) = $1 AND EXTRACT(YEAR FROM data_iso) = $2
        `, [month, year]);
        const custoTotal = parseFloat(custosRes.rows[0].custo_total || 0);
        const custoPerKg = producaoFusaoKg > 0 ? custoTotal / producaoFusaoKg : 0;

        // --- DADOS DO MÊS ANTERIOR (MoM) ---
        const prevMonthDate = new Date(year, month - 2, 1);
        const prevYear = prevMonthDate.getFullYear();
        const prevMonth = prevMonthDate.getMonth() + 1;

        const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
        const pNextMonth = prevMonth === 12 ? 1 : prevMonth + 1;
        const pNextYear = prevMonth === 12 ? prevYear + 1 : prevYear;
        const prevEndDate = `${pNextYear}-${String(pNextMonth).padStart(2, '0')}-01`;

        // Prev Fusão
        const prevFusaoRes = await pool.query(`
            SELECT 
                COALESCE(SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), p.peso, 0)), 0) as peso_total
            FROM producao_apontada_sincronizada t
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            WHERE t.data_producao >= $1 AND t.data_producao < $2
              AND UPPER(t.setor) = 'FUSAO'
        `, [prevStartDate, prevEndDate]);
        const prevProducaoFusaoKg = parseFloat(prevFusaoRes.rows[0].peso_total || 0);

        // Prev Faturamento
        let prevFatQuery = `
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
        `;
        const prevFatParams = [prevStartDate, prevEndDate];
        if (excludedClients.length > 0) {
            prevFatQuery += ` AND TRIM(f.cliente_nome) NOT IN (${excludedClients.map((_, i) => `$${i + 3}`).join(',')})`;
            prevFatParams.push(...excludedClients);
        }
        const prevFatRes = await pool.query(prevFatQuery, prevFatParams);
        const prevFaturamentoKg = parseFloat(prevFatRes.rows[0].fat_peso || 0);
        const prevFaturamentoValor = parseFloat(prevFatRes.rows[0].fat_valor || 0);

        // Prev Custos
        const prevCustosRes = await pool.query(`
            SELECT COALESCE(SUM(valor), 0) as custo_total
            FROM custos_lancamentos
            WHERE EXTRACT(MONTH FROM data_iso) = $1 AND EXTRACT(YEAR FROM data_iso) = $2
        `, [prevMonth, prevYear]);
        const prevCustoTotal = parseFloat(prevCustosRes.rows[0].custo_total || 0);
        const prevCustoPerKg = prevProducaoFusaoKg > 0 ? prevCustoTotal / prevProducaoFusaoKg : 0;
        // -----------------------------------

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

        let fatEvoQuery = `
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
        `;
        const fatEvoParams = [year];
        if (excludedClients.length > 0) {
            fatEvoQuery += ` AND TRIM(f.cliente_nome) NOT IN (${excludedClients.map((_, i) => `$${i + 2}`).join(',')})`;
            fatEvoParams.push(...excludedClients);
        }
        fatEvoQuery += ` GROUP BY EXTRACT(MONTH FROM f.data_faturamento) ORDER BY mes`;
        const fatEvolucaoRes = await pool.query(fatEvoQuery, fatEvoParams);

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

                // MoM KPIs
                prevProducaoFusaoKg: Math.round(prevProducaoFusaoKg),
                prevFaturamentoKg: Math.round(prevFaturamentoKg),
                prevFaturamentoValor: Math.round(prevFaturamentoValor * 100) / 100,
                prevCustoTotal: Math.round(prevCustoTotal * 100) / 100,
                prevCustoPerKg: Math.round(prevCustoPerKg * 100) / 100,

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
                })),

                // 8. Top 10 Fornecedores (mês selecionado) - Buscando da tabela detalhada sincronizada
                topFornecedores: (await pool.query(`
                    SELECT 
                        nome as fornecedor,
                        SUM(valor) as total
                    FROM custos_registros
                    WHERE mes = $1 AND ano = $2 AND categoria = 'fornecedores'
                    GROUP BY nome
                    ORDER BY total DESC
                    LIMIT 10
                `, [month, year])).rows.map(r => ({
                    fornecedor: r.fornecedor,
                    total: Math.round(parseFloat(r.total || 0))
                }))
            }
        });

    } catch (error) {
        console.error('❌ Erro no custos-dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
