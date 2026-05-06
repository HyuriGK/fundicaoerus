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
// Retorna dia a dia: peso emitido (entrada) e peso faturado (saída) para o mês/ano
router.get('/variacao-diaria', async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) {
            return res.status(400).json({ error: 'Ano e mês são obrigatórios.' });
        }

        // Emissões do dia (total emitido, sem filtro de pendente)
        const emissoesQuery = `
            SELECT
                (p.data->>'DATA_EMISSAO_PEDIDO')::date AS dia,
                SUM(
                    COALESCE(pc.peso,
                        CASE WHEN CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) > 0
                             THEN CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR','0') AS NUMERIC)
                                  / CAST(p.data->>'QUANTIDADE_PPR' AS NUMERIC)
                             ELSE 0 END
                    ) * CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC)
                ) AS peso_entrada
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1
              AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $2
              AND p.data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
            GROUP BY 1
            ORDER BY 1
        `;

        // Faturamentos do dia (saída), cruzando codigo_item com pesos_customizados
        // Para itens sem peso customizado usamos PESO_LIQUIDO_NPR da emissao se disponível,
        // mas como faturamento não guarda peso unitário, usamos apenas o customizado como fonte
        const faturamentosQuery = `
            SELECT
                f.data_faturamento AS dia,
                SUM(
                    COALESCE(pc.peso, 0) * f.quantidade
                ) AS peso_saida
            FROM faturamento_firebird f
            LEFT JOIN pesos_customizados pc ON f.codigo_item::text = pc.codigo
            WHERE EXTRACT(YEAR FROM f.data_faturamento) = $1
              AND EXTRACT(MONTH FROM f.data_faturamento) = $2
              AND f.data_faturamento IS NOT NULL
            GROUP BY 1
            ORDER BY 1
        `;

        const [emRes, fatRes] = await Promise.all([
            pool.query(emissoesQuery, [ano, mes]),
            pool.query(faturamentosQuery, [ano, mes])
        ]);

        // Montar mapa por dia
        const entradaMap = {};
        emRes.rows.forEach(r => {
            const d = r.dia instanceof Date ? r.dia.toISOString().split('T')[0] : String(r.dia).split('T')[0];
            entradaMap[d] = parseFloat(r.peso_entrada) || 0;
        });
        const saidaMap = {};
        fatRes.rows.forEach(r => {
            const d = r.dia instanceof Date ? r.dia.toISOString().split('T')[0] : String(r.dia).split('T')[0];
            saidaMap[d] = parseFloat(r.peso_saida) || 0;
        });

        // Gerar todos os dias do mês
        const year = parseInt(ano);
        const month = parseInt(mes);
        const daysInMonth = new Date(year, month, 0).getDate();
        const result = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            result.push({
                dia: dateStr,
                entrada: entradaMap[dateStr] || 0,
                saida: saidaMap[dateStr] || 0
            });
        }

        res.json(result);
    } catch (error) {
        console.error('Erro ao buscar variação diária:', error);
        res.status(500).json({ error: 'Erro interno ao processar variação diária.' });
    }
});

module.exports = router;

