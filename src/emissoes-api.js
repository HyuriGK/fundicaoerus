const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/emissoes/monthly-summary
router.get('/monthly-summary', async (req, res) => {
    try {
        const query = `
            SELECT 
                EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) as ano,
                EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) as mes,
                SUM(COALESCE(pc.peso * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC), CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR', '0') AS NUMERIC))) as total_peso,
                SUM(CAST(COALESCE(p.data->>'VALOR_PPR', '0') AS NUMERIC) * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC)) as total_valor
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            WHERE p.data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
            GROUP BY 1, 2
            ORDER BY 1 DESC, 2 DESC
        `;

        const result = await pool.query(query);

        const formatted = result.rows.map(row => ({
            ano: parseInt(row.ano),
            mes: parseInt(row.mes),
            totalPeso: parseFloat(row.total_peso),
            totalValor: parseFloat(row.total_valor)
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Erro ao buscar resumo de emissões:', error);
        res.status(500).json({ error: 'Erro interno ao processar dados de emissões.' });
    }
});

// GET /api/emissoes/client-summary
router.get('/client-summary', async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano) {
            return res.status(400).json({ error: 'Ano é obrigatório.' });
        }

        let whereClause = "WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1";
        const params = [ano];

        if (mes && mes !== 'Todos') {
            whereClause += " AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $2";
            params.push(mes);
        }

        const query = `
            SELECT 
                p.data->>'NOME_CLIENTE' as cliente,
                p.data->>'ID_CLIENTE_CORE' as id_cliente,
                SUM(COALESCE(pc.peso * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC), CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR', '0') AS NUMERIC))) as total_peso,
                SUM(CAST(COALESCE(p.data->>'VALOR_PPR', '0') AS NUMERIC) * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC)) as total_valor
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${whereClause}
            GROUP BY 1, 2
            ORDER BY 3 DESC
        `;

        const result = await pool.query(query, params);

        const formatted = result.rows.map(row => ({
            id: row.id_cliente,
            name: row.cliente,
            totalPeso: parseFloat(row.total_peso),
            totalValor: parseFloat(row.total_valor)
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Erro ao buscar resumo de clientes:', error);
        res.status(500).json({ error: 'Erro interno ao processar resumo de clientes.' });
    }
});

// GET /api/emissoes/list
router.get('/list', async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano) {
            return res.status(400).json({ error: 'Ano é obrigatório.' });
        }

        let whereClause = "WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1";
        const params = [ano];

        if (mes && mes !== 'Todos') {
            whereClause += " AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $2";
            params.push(mes);
        }

        const query = `
            SELECT 
                p.data,
                pc.peso as peso_customizado
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${whereClause}
            ORDER BY (p.data->>'DATA_EMISSAO_PEDIDO')::date DESC
        `;

        const result = await pool.query(query, params);
        const records = result.rows.map(row => {
            const data = row.data;
            if (row.peso_customizado !== null) {
                // Return corrected weight in the data object
                data.PESO_LIQUIDO_NPR = row.peso_customizado * (parseFloat(data.QUANTIDADE_PPR) || 0);
                data.PESO_UNIT_ORIGINAL = data.PESO_UNIT; // Preserve original for debug if needed
                data.PESO_UNIT = row.peso_customizado;
            }
            return data;
        });

        res.json(records);
    } catch (error) {
        console.error('Erro ao listar registros de emissões:', error);
        res.status(500).json({ error: 'Erro interno ao listar registros.' });
    }
});

// GET /api/emissoes/pending-summary  
// Mesma fonte (firebird_sync_emissoes), mas filtra apenas itens com entrega pendente (não faturados)
router.get('/pending-summary', async (req, res) => {
    try {
        const query = `
            SELECT 
                EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) as ano,
                EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) as mes,
                SUM(
                    COALESCE(pc.peso, 
                        CASE WHEN CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) > 0 
                             THEN CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR','0') AS NUMERIC) / CAST(p.data->>'QUANTIDADE_PPR' AS NUMERIC)
                             ELSE 0 END
                    ) * (
                        CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) 
                        - COALESCE(CAST(COALESCE(p.data->>'QUANTIDADE_FATURADA_PPR','0') AS NUMERIC), 0)
                    )
                ) as total_peso,
                SUM(
                    CAST(COALESCE(p.data->>'VALOR_PPR', '0') AS NUMERIC) 
                    * (
                        CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) 
                        - COALESCE(CAST(COALESCE(p.data->>'QUANTIDADE_FATURADA_PPR','0') AS NUMERIC), 0)
                    )
                ) as total_valor
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            WHERE p.data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
              AND TRIM(COALESCE(p.data->>'FATURADO_PPR','')) <> 'T'
              AND (CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) - COALESCE(CAST(COALESCE(p.data->>'QUANTIDADE_FATURADA_PPR','0') AS NUMERIC), 0)) > 0
            GROUP BY 1, 2
            ORDER BY 1 DESC, 2 DESC
        `;

        const result = await pool.query(query);

        const formatted = result.rows.map(row => ({
            ano: parseInt(row.ano),
            mes: parseInt(row.mes),
            totalPeso: parseFloat(row.total_peso),
            totalValor: parseFloat(row.total_valor)
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Erro ao buscar resumo de emissões pendentes:', error);
        res.status(500).json({ error: 'Erro interno ao processar dados de emissões pendentes.' });
    }
});

// GET /api/emissoes/pending-list
// Retorna registros individuais para a visão diária do gráfico pendente
router.get('/pending-list', async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) {
            return res.status(400).json({ error: 'Ano e mês são obrigatórios.' });
        }

        const query = `
            SELECT 
                p.data,
                pc.peso as peso_customizado
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1
              AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $2
              AND TRIM(COALESCE(p.data->>'FATURADO_PPR','')) <> 'T'
              AND (CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) - COALESCE(CAST(COALESCE(p.data->>'QUANTIDADE_FATURADA_PPR','0') AS NUMERIC), 0)) > 0
            ORDER BY (p.data->>'DATA_EMISSAO_PEDIDO')::date DESC
        `;

        const result = await pool.query(query, [ano, mes]);
        const records = result.rows.map(row => {
            const data = row.data;
            if (row.peso_customizado !== null) {
                data.PESO_LIQUIDO_NPR = row.peso_customizado * (parseFloat(data.QUANTIDADE_PPR) || 0);
                data.PESO_UNIT = row.peso_customizado;
            }
            return data;
        });

        res.json(records);
    } catch (error) {
        console.error('Erro ao listar registros de emissões pendentes:', error);
        res.status(500).json({ error: 'Erro interno ao listar registros pendentes.' });
    }
});

// GET /api/emissoes/variacao-diaria?ano=2026&mes=5
// Entrada: peso total emitido no dia (mesma lógica do gráfico de emissão de pedidos.html)
//   = customWeights[produto] ?? (PESO_LIQUIDO_NPR / QUANTIDADE_PPR), * QUANTIDADE_PPR
// Saída: peso_total já calculado na faturamento_firebird (mesma fonte do gráfico diário de faturamentos.html)
router.get('/variacao-diaria', async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) {
            return res.status(400).json({ error: 'Ano e mês são obrigatórios.' });
        }

        // Entrada: mesma lógica de pedidos.html — customWeights tem prioridade, fallback PESO_LIQUIDO_NPR/qtd * qtd
        const emissoesQuery = `
            SELECT
                (p.data->>'DATA_EMISSAO_PEDIDO')::date AS dia,
                SUM(
                    CASE
                        WHEN pc.peso IS NOT NULL THEN pc.peso * CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC)
                        WHEN CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) > 0
                            THEN CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR','0') AS NUMERIC)
                        ELSE 0
                    END
                ) AS peso_entrada,
                SUM(
                    CAST(COALESCE(p.data->>'VALOR_PPR','0') AS NUMERIC) *
                    CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC)
                ) AS valor_entrada
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            WHERE EXTRACT(YEAR  FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1
              AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $2
              AND p.data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
            GROUP BY 1
            ORDER BY 1
        `;

        const faturamentosQuery = `
            SELECT
                f.data_faturamento AS dia,
                SUM(f.peso_total) AS peso_saida,
                SUM(f.valor_unitario * f.quantidade) AS valor_saida
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            WHERE EXTRACT(YEAR  FROM f.data_faturamento) = $1
              AND EXTRACT(MONTH FROM f.data_faturamento) = $2
              AND f.data_faturamento IS NOT NULL
              AND COALESCE(p.excluido, f.excluido_manualmente OR f.pedido IS NULL OR TRIM(COALESCE(f.pedido,'')) = '') = FALSE
              AND TRIM(CAST(f.cliente_codigo AS TEXT)) <> '257'
              AND UPPER(TRIM(f.cliente_nome)) NOT LIKE '%IMEPEL INDUSTRIA MECANICA%'
              AND UPPER(TRIM(f.cliente_nome)) NOT LIKE '%STEELROOL INDUSTRIA METALURGICA%'
              AND UPPER(TRIM(f.cliente_nome)) NOT LIKE '%SPILROD FUNDICAO DE FERRO E ACO%'
              AND NOT (TRIM(CAST(f.codigo_item AS TEXT)) LIKE '%1' AND UPPER(TRIM(f.descricao)) LIKE 'MODELO%')
            GROUP BY 1
            ORDER BY 1
        `;

        const [emRes, fatRes] = await Promise.all([
            pool.query(emissoesQuery, [ano, mes]),
            pool.query(faturamentosQuery, [ano, mes])
        ]);

        const toDateStr = (v) => v instanceof Date ? v.toISOString().split('T')[0] : String(v).split('T')[0];

        const entradaMap = {};
        emRes.rows.forEach(r => {
            entradaMap[toDateStr(r.dia)] = { peso: parseFloat(r.peso_entrada) || 0, valor: parseFloat(r.valor_entrada) || 0 };
        });

        const saidaMap = {};
        fatRes.rows.forEach(r => {
            saidaMap[toDateStr(r.dia)] = { peso: parseFloat(r.peso_saida) || 0, valor: parseFloat(r.valor_saida) || 0 };
        });

        const year = parseInt(ano);
        const month = parseInt(mes);
        const daysInMonth = new Date(year, month, 0).getDate();
        const result = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const e = entradaMap[dateStr] || { peso: 0, valor: 0 };
            const s = saidaMap[dateStr] || { peso: 0, valor: 0 };
            result.push({ dia: dateStr, entrada: e.peso, saida: s.peso, valorEntrada: e.valor, valorSaida: s.valor });
        }

        res.json(result);
    } catch (error) {
        console.error('Erro ao buscar variação diária:', error);
        res.status(500).json({ error: 'Erro interno ao processar variação diária.' });
    }
});

// GET /api/emissoes/variacao-mensal?ano=2026
// Retorna mês a mês: peso emitido (entrada) e peso faturado (saída) — modo TODOS
router.get('/variacao-mensal', async (req, res) => {
    try {
        const { ano } = req.query;
        if (!ano) return res.status(400).json({ error: 'ano é obrigatório.' });

        const emissoesQuery = `
            SELECT
                EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date)::int AS mes,
                SUM(
                    CASE
                        WHEN pc.peso IS NOT NULL THEN pc.peso * CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC)
                        WHEN CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) > 0
                            THEN CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR','0') AS NUMERIC)
                        ELSE 0
                    END
                ) AS peso_entrada,
                SUM(
                    CAST(COALESCE(p.data->>'VALOR_PPR','0') AS NUMERIC) *
                    CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC)
                ) AS valor_entrada
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1
              AND p.data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
            GROUP BY 1 ORDER BY 1
        `;

        const faturamentosQuery = `
            SELECT
                EXTRACT(MONTH FROM f.data_faturamento)::int AS mes,
                SUM(f.peso_total) AS peso_saida,
                SUM(f.valor_unitario * f.quantidade) AS valor_saida
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            WHERE EXTRACT(YEAR FROM f.data_faturamento) = $1
              AND f.data_faturamento IS NOT NULL
              AND COALESCE(p.excluido, f.excluido_manualmente OR f.pedido IS NULL OR TRIM(COALESCE(f.pedido,'')) = '') = FALSE
              AND TRIM(CAST(f.cliente_codigo AS TEXT)) <> '257'
              AND UPPER(TRIM(f.cliente_nome)) NOT LIKE '%IMEPEL INDUSTRIA MECANICA%'
              AND UPPER(TRIM(f.cliente_nome)) NOT LIKE '%STEELROOL INDUSTRIA METALURGICA%'
              AND UPPER(TRIM(f.cliente_nome)) NOT LIKE '%SPILROD FUNDICAO DE FERRO E ACO%'
              AND NOT (TRIM(CAST(f.codigo_item AS TEXT)) LIKE '%1' AND UPPER(TRIM(f.descricao)) LIKE 'MODELO%')
            GROUP BY 1 ORDER BY 1
        `;

        const [emRes, fatRes] = await Promise.all([
            pool.query(emissoesQuery, [ano]),
            pool.query(faturamentosQuery, [ano])
        ]);

        const entradaMap = {};
        emRes.rows.forEach(r => { entradaMap[r.mes] = { peso: parseFloat(r.peso_entrada) || 0, valor: parseFloat(r.valor_entrada) || 0 }; });
        const saidaMap = {};
        fatRes.rows.forEach(r => { saidaMap[r.mes] = { peso: parseFloat(r.peso_saida) || 0, valor: parseFloat(r.valor_saida) || 0 }; });

        const result = [];
        for (let m = 1; m <= 12; m++) {
            const e = entradaMap[m] || { peso: 0, valor: 0 };
            const s = saidaMap[m] || { peso: 0, valor: 0 };
            result.push({ mes: m, entrada: e.peso, saida: s.peso, valorEntrada: e.valor, valorSaida: s.valor });
        }
        res.json(result);
    } catch (error) {
        console.error('Erro ao buscar variação mensal:', error);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

// GET /api/emissoes/variacao-detalhe?data=2026-05-06
// Retorna linha a linha: entradas (emissões) e saídas (faturamentos) do dia
router.get('/variacao-detalhe', async (req, res) => {
    try {
        const { data } = req.query;
        if (!data) return res.status(400).json({ error: 'data é obrigatória (YYYY-MM-DD).' });

        const emissoesQuery = `
            SELECT
                p.data->>'CODIGO_PPR'        AS pedido,
                p.data->>'PRODUTO_PPR'       AS codigo,
                p.data->>'NOME_PRODUTO_PPR'  AS descricao,
                p.data->>'NOME_CLIENTE'      AS cliente,
                CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) AS quantidade,
                CASE
                    WHEN pc.peso IS NOT NULL THEN pc.peso * CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC)
                    WHEN CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) > 0
                        THEN CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR','0') AS NUMERIC)
                    ELSE 0
                END AS peso_total
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            WHERE (p.data->>'DATA_EMISSAO_PEDIDO')::date = $1
            ORDER BY cliente, codigo
        `;

        const faturamentosQuery = `
            SELECT
                TRIM(COALESCE(f.pedido,''))  AS pedido,
                CAST(f.codigo_item AS TEXT)  AS codigo,
                f.descricao,
                f.cliente_nome               AS cliente,
                f.quantidade,
                f.peso_total
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            WHERE f.data_faturamento = $1
              AND COALESCE(p.excluido, f.excluido_manualmente OR f.pedido IS NULL OR TRIM(COALESCE(f.pedido,'')) = '') = FALSE
              AND TRIM(CAST(f.cliente_codigo AS TEXT)) <> '257'
              AND UPPER(TRIM(f.cliente_nome)) NOT LIKE '%IMEPEL INDUSTRIA MECANICA%'
              AND UPPER(TRIM(f.cliente_nome)) NOT LIKE '%STEELROOL INDUSTRIA METALURGICA%'
              AND UPPER(TRIM(f.cliente_nome)) NOT LIKE '%SPILROD FUNDICAO DE FERRO E ACO%'
              AND NOT (TRIM(CAST(f.codigo_item AS TEXT)) LIKE '%1' AND UPPER(TRIM(f.descricao)) LIKE 'MODELO%')
            ORDER BY f.cliente_nome, f.codigo_item
        `;

        const [emRes, fatRes] = await Promise.all([
            pool.query(emissoesQuery, [data]),
            pool.query(faturamentosQuery, [data])
        ]);

        res.json({
            entradas: emRes.rows.map(r => ({
                pedido:    r.pedido,
                codigo:    r.codigo,
                descricao: r.descricao,
                cliente:   r.cliente,
                quantidade: parseFloat(r.quantidade) || 0,
                pesoTotal:  parseFloat(r.peso_total) || 0
            })),
            saidas: fatRes.rows.map(r => ({
                pedido:    r.pedido,
                codigo:    r.codigo,
                descricao: r.descricao,
                cliente:   r.cliente,
                quantidade: parseFloat(r.quantidade) || 0,
                pesoTotal:  parseFloat(r.peso_total) || 0
            }))
        });
    } catch (error) {
        console.error('Erro ao buscar detalhe de variação:', error);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

module.exports = router;

