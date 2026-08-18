const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

function getCommercialOwnerRestriction(req) {
    const role = String(req.user?.role || '').trim().toLowerCase();
    const username = String(req.user?.user || '').trim().toLowerCase();
    const name = String(req.user?.name || '').trim().toLowerCase();
    if (role === 'comercial' && (username === 'geruza' || name === 'geruza mendes')) return 'GERUZA MENDES';
    if (role === 'comercial' && (username === 'elisangela' || name === 'elisangela')) return 'ELISANGELA';
    return null;
}

function addCommercialOwnerScope(req, params) {
    const owner = getCommercialOwnerRestriction(req);
    if (!owner) return { join: '', condition: '' };
    params.push(owner);
    return {
        join: `
            JOIN clientes_firebird_sync c
              ON c.codigo::text = p.data->>'ID_CLIENTE_CORE'
            JOIN clientes_responsavel_comercial rc
              ON rc.empresa = c.empresa
             AND rc.codigo = c.codigo
        `,
        condition: ` AND rc.responsavel_comercial = $${params.length}`
    };
}

const emissionNumberSql = field => `
    COALESCE(
        CASE
            WHEN REPLACE(NULLIF(TRIM(p.data->>'${field}'), ''), ',', '.') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                THEN REPLACE(NULLIF(TRIM(p.data->>'${field}'), ''), ',', '.')::numeric
            ELSE NULL
        END,
        0
    )
`;
const SERVICE_CLIENT_CODES = ['253', '257', '316', '432', '2020', '2283'];
const SERVICE_CLIENT_NAMES = [
    'MONFERRATO INDUSTRIA E COMERCIO DE PECAS',
    'SPILROD FUNDICAO DE FERRO E ACO',
    'STEELROOL INDUSTRIA METALURGICA',
    'ACO NOBRE',
    'IMEPEL INDUSTRIA MECANICA',
    'USITH USINAGEM E AJUSTAGEM'
];
const serviceCodeListSql = SERVICE_CLIENT_CODES.map(c => `'${c}'`).join(', ');
const serviceNameFilterSql = alias => SERVICE_CLIENT_NAMES.map(name => `AND UPPER(TRIM(COALESCE(${alias}, ''))) NOT LIKE '%${name}%'`).join('\n              ');
const emissionServiceFilterSql = `
              AND COALESCE(TRIM(p.data->>'ID_CLIENTE_CORE'), '') NOT IN (${serviceCodeListSql})
              ${serviceNameFilterSql(`p.data->>'NOME_CLIENTE'`)}
`;
const faturamentoServiceFilterSql = `
              AND COALESCE(TRIM(CAST(f.cliente_codigo AS TEXT)), '') NOT IN (${serviceCodeListSql})
              ${serviceNameFilterSql('f.cliente_nome')}
`;
const emissionQtySql = emissionNumberSql('QUANTIDADE_PPR');
const emissionUnitWeightSql = `
    COALESCE(
        NULLIF(f.peso_liquido_pro, 0),
        NULLIF(${emissionNumberSql('PESO_UNIT')}, 0),
        NULLIF(${emissionNumberSql('PESO_PRODUTO')}, 0),
        NULLIF(pp.peso_produto, 0),
        CASE
            WHEN ${emissionNumberSql('PESO_LIQUIDO_NPR')} > 0
                 AND ${emissionQtySql} > 0
                THEN ${emissionNumberSql('PESO_LIQUIDO_NPR')} / ${emissionQtySql}
            ELSE NULL
        END,
        pc.peso,
        0
    )
`;
const emissionTotalWeightSql = `(${emissionUnitWeightSql} * ${emissionQtySql})`;
const emissionFichaJoinSql = `
            LEFT JOIN LATERAL (
                SELECT peso_liquido_pro, data_fic, pro_codigo_fic, tipo_moldagem_procedimento
                FROM ficha_tecnica
                WHERE TRIM(pro_codigo_fic) = TRIM(p.data->>'PRODUTO_PPR')
                ORDER BY updated_at DESC
                LIMIT 1
            ) f ON true
`;
const emissionPedidoPesoJoinSql = `
            LEFT JOIN LATERAL (
                SELECT
                    CASE
                        WHEN REPLACE(NULLIF(TRIM(fp.data->>'PESO_PRODUTO'), ''), ',', '.') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                            THEN REPLACE(NULLIF(TRIM(fp.data->>'PESO_PRODUTO'), ''), ',', '.')::numeric
                        ELSE NULL
                    END AS peso_produto
                FROM firebird_sync_pedidos fp
                WHERE TRIM(fp.data->>'PRODUTO_PPR') = TRIM(p.data->>'PRODUTO_PPR')
                  AND NULLIF(TRIM(fp.data->>'PESO_PRODUTO'), '') IS NOT NULL
                ORDER BY fp.updated_at DESC
                LIMIT 1
            ) pp ON true
`;

// GET /api/emissoes/monthly-summary
router.get('/monthly-summary', async (req, res) => {
    try {
        const params = [];
        const ownerScope = addCommercialOwnerScope(req, params);
        const query = `
            SELECT 
                EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) as ano,
                EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) as mes,
                SUM(${emissionTotalWeightSql}) as total_peso,
                SUM(CASE
                    WHEN UPPER(TRIM(COALESCE(f.tipo_moldagem_procedimento, ''))) = 'MOLDAGEM PESADA'
                        THEN ${emissionTotalWeightSql}
                    ELSE 0
                END) as total_moldagem_pesada,
                SUM(CASE
                    WHEN UPPER(TRIM(COALESCE(f.tipo_moldagem_procedimento, ''))) = 'MOLDAGEM MANUAL'
                        THEN ${emissionTotalWeightSql}
                    ELSE 0
                END) as total_moldagem_manual,
                SUM(CASE
                    WHEN UPPER(TRIM(COALESCE(f.tipo_moldagem_procedimento, ''))) = 'MOLDAGEM LEVE'
                        THEN ${emissionTotalWeightSql}
                    ELSE 0
                END) as total_moldagem_leve,
                SUM(CASE
                    WHEN UPPER(TRIM(COALESCE(f.tipo_moldagem_procedimento, ''))) NOT IN ('MOLDAGEM PESADA', 'MOLDAGEM MANUAL', 'MOLDAGEM LEVE')
                        THEN ${emissionTotalWeightSql}
                    ELSE 0
                END) as total_sem_tipo_moldagem,
                SUM(
                    CASE
                        WHEN pc.peso IS NOT NULL AND CAST(COALESCE(p.data->>'PRECO_KG', '0') AS NUMERIC) > 0
                            THEN CAST(COALESCE(p.data->>'PRECO_KG', '0') AS NUMERIC) * pc.peso * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC)
                        ELSE
                            CAST(COALESCE(p.data->>'VALOR_PPR', '0') AS NUMERIC) * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC)
                    END
                ) as total_valor
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${emissionFichaJoinSql}
            ${emissionPedidoPesoJoinSql}
            ${ownerScope.join}
            WHERE p.data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
            ${emissionServiceFilterSql}
            ${ownerScope.condition}
            GROUP BY 1, 2
            ORDER BY 1 DESC, 2 DESC
        `;

        const result = await pool.query(query, params);

        const formatted = result.rows.map(row => ({
            ano: parseInt(row.ano),
            mes: parseInt(row.mes),
            totalPeso: parseFloat(row.total_peso),
            totalMoldagemPesada: parseFloat(row.total_moldagem_pesada) || 0,
            totalMoldagemManual: parseFloat(row.total_moldagem_manual) || 0,
            totalMoldagemLeve: parseFloat(row.total_moldagem_leve) || 0,
            totalSemTipoMoldagem: parseFloat(row.total_sem_tipo_moldagem) || 0,
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
        whereClause += emissionServiceFilterSql;
        const ownerScope = addCommercialOwnerScope(req, params);

        const query = `
            SELECT 
                p.data->>'NOME_CLIENTE' as cliente,
                p.data->>'ID_CLIENTE_CORE' as id_cliente,
                SUM(${emissionTotalWeightSql}) as total_peso,
                SUM(
                    CASE
                        WHEN pc.peso IS NOT NULL AND CAST(COALESCE(p.data->>'PRECO_KG', '0') AS NUMERIC) > 0
                            THEN CAST(COALESCE(p.data->>'PRECO_KG', '0') AS NUMERIC) * pc.peso * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC)
                        ELSE
                            CAST(COALESCE(p.data->>'VALOR_PPR', '0') AS NUMERIC) * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC)
                    END
                ) as total_valor
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${emissionFichaJoinSql}
            ${emissionPedidoPesoJoinSql}
            ${ownerScope.join}
            ${whereClause}
            ${ownerScope.condition}
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
        const { ano, mes, dia } = req.query;
        if (!ano) {
            return res.status(400).json({ error: 'Ano é obrigatório.' });
        }

        let whereClause = "WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1";
        const params = [ano];

        if (mes && mes !== 'Todos') {
            whereClause += ` AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $${params.length + 1}`;
            params.push(mes);
        }

        if (dia) {
            whereClause += ` AND EXTRACT(DAY FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $${params.length + 1}`;
            params.push(dia);
        }
        whereClause += emissionServiceFilterSql;
        const ownerScope = addCommercialOwnerScope(req, params);

        const query = `
            SELECT 
                p.data,
                p.sync_key,
                pc.peso as peso_customizado,
                ${emissionUnitWeightSql} AS peso_resolvido_unit,
                f.peso_liquido_pro AS ficha_peso,
                pp.peso_produto AS pedido_peso_produto,
                f.data_fic,
                f.pro_codigo_fic AS has_ficha,
                f.tipo_moldagem_procedimento,
                obs.observacao
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${emissionFichaJoinSql}
            ${emissionPedidoPesoJoinSql}
            LEFT JOIN pedidos_observacoes obs ON obs.sync_key = p.sync_key
            ${ownerScope.join}
            ${whereClause}
            ${ownerScope.condition}
            ORDER BY (p.data->>'DATA_EMISSAO_PEDIDO')::date DESC
        `;

        const result = await pool.query(query, params);
        const linksResult = await pool.query('SELECT sync_key, op, status FROM pedidos_op_links');
        const linksMap = {};
        linksResult.rows.forEach(link => { linksMap[link.sync_key] = link; });
        const records = result.rows.map(row => {
            const data = {
                ...row.data,
                sync_key: row.sync_key,
                observacao: row.observacao || '',
                _peso_resolvido_unit: row.peso_resolvido_unit,
                _data_fic: row.data_fic,
                _has_ficha: !!row.has_ficha,
                _tipo_moldagem_procedimento: row.tipo_moldagem_procedimento || null
            };
            const manualLink = linksMap[row.sync_key];
            if (manualLink?.status === 'confirmado') {
                data.LINK_STATUS = 'confirmado';
                data.OP_PCS = manualLink.op;
            } else if ((manualLink?.status === 'rejeitado' || manualLink?.status === 'removido') && data.LINK_STATUS !== 'oficial') {
                data.LINK_STATUS = manualLink.status;
                data.OP_PCS = null;
            }
            if (row.ficha_peso !== null && Number(row.ficha_peso) > 0 && !(parseFloat(data.PESO_UNIT) > 0) && !(parseFloat(data.PESO_PRODUTO) > 0)) {
                data.PESO_PRODUTO = row.ficha_peso;
            }
            if (row.pedido_peso_produto !== null && Number(row.pedido_peso_produto) > 0 && !(parseFloat(data.PESO_UNIT) > 0) && !(parseFloat(data.PESO_PRODUTO) > 0)) {
                data.PESO_PRODUTO = row.pedido_peso_produto;
            }
            if (
                row.peso_customizado !== null &&
                !(parseFloat(data.PESO_UNIT) > 0) &&
                !(parseFloat(data.PESO_PRODUTO) > 0) &&
                !(parseFloat(data.PESO_LIQUIDO_NPR) > 0)
            ) {
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
                    ${emissionUnitWeightSql} * (
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
            ${emissionFichaJoinSql}
            ${emissionPedidoPesoJoinSql}
            WHERE p.data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
              ${emissionServiceFilterSql}
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
                pc.peso as peso_customizado,
                ${emissionUnitWeightSql} AS peso_resolvido_unit,
                f.peso_liquido_pro AS ficha_peso,
                pp.peso_produto AS pedido_peso_produto
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${emissionFichaJoinSql}
            ${emissionPedidoPesoJoinSql}
            WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1
              AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $2
              ${emissionServiceFilterSql}
              AND TRIM(COALESCE(p.data->>'FATURADO_PPR','')) <> 'T'
              AND (CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC) - COALESCE(CAST(COALESCE(p.data->>'QUANTIDADE_FATURADA_PPR','0') AS NUMERIC), 0)) > 0
            ORDER BY (p.data->>'DATA_EMISSAO_PEDIDO')::date DESC
        `;

        const result = await pool.query(query, [ano, mes]);
        const records = result.rows.map(row => {
            const data = row.data;
            data._peso_resolvido_unit = row.peso_resolvido_unit;
            if (row.ficha_peso !== null && Number(row.ficha_peso) > 0 && !(parseFloat(data.PESO_UNIT) > 0) && !(parseFloat(data.PESO_PRODUTO) > 0)) {
                data.PESO_PRODUTO = row.ficha_peso;
            }
            if (row.pedido_peso_produto !== null && Number(row.pedido_peso_produto) > 0 && !(parseFloat(data.PESO_UNIT) > 0) && !(parseFloat(data.PESO_PRODUTO) > 0)) {
                data.PESO_PRODUTO = row.pedido_peso_produto;
            }
            if (
                row.peso_customizado !== null &&
                !(parseFloat(data.PESO_UNIT) > 0) &&
                !(parseFloat(data.PESO_PRODUTO) > 0) &&
                !(parseFloat(data.PESO_LIQUIDO_NPR) > 0)
            ) {
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
//   = PESO_LIQUIDO_NPR do ERP; se vier zerado, usa customWeights[produto] * quantidade
// Saída: peso_total já calculado na faturamento_firebird (mesma fonte do gráfico diário de faturamentos.html)
router.get('/variacao-diaria', async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) {
            return res.status(400).json({ error: 'Ano e mês são obrigatórios.' });
        }

        // Entrada: mesma logica de pedidos.html: ERP primeiro, customizado apenas como fallback
        const emissoesQuery = `
            SELECT
                (p.data->>'DATA_EMISSAO_PEDIDO')::date AS dia,
                SUM(${emissionTotalWeightSql}) AS peso_entrada,
                SUM(
                    CAST(COALESCE(p.data->>'VALOR_PPR','0') AS NUMERIC) *
                    CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC)
                ) AS valor_entrada
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${emissionFichaJoinSql}
            ${emissionPedidoPesoJoinSql}
            WHERE EXTRACT(YEAR  FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1
              AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $2
              AND p.data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
              ${emissionServiceFilterSql}
            GROUP BY 1
            ORDER BY 1
        `;

        const faturamentosQuery = `
            WITH fat_peso_overrides AS (
                SELECT fp.item_key, fp.item_value::boolean AS fat_peso
                FROM app_preferences p
                CROSS JOIN LATERAL jsonb_each_text(COALESCE(p.value, '{}'::jsonb)) AS fp(item_key, item_value)
                WHERE p.key = 'fat_peso_overrides'
            )
            SELECT
                f.data_faturamento AS dia,
                SUM(COALESCE(f.peso_un, 0) * COALESCE(f.quantidade, 0)) AS peso_saida,
                SUM(f.valor_unitario * f.quantidade) AS valor_saida
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            LEFT JOIN fat_peso_overrides o
                ON o.item_key = CONCAT(
                    f.nota_fiscal,
                    '-',
                    COALESCE(TRIM(f.codigo_item), ''),
                    '-',
                    COALESCE(TRIM(f.pedido), ''),
                    '-',
                    f.data_faturamento::date,
                    '-',
                    COALESCE(f.quantidade, 0)
                )
            WHERE EXTRACT(YEAR  FROM f.data_faturamento) = $1
              AND EXTRACT(MONTH FROM f.data_faturamento) = $2
              AND f.data_faturamento IS NOT NULL
              AND COALESCE(o.fat_peso, CASE WHEN f.gera_financeiro = 'N' THEN false ELSE NOT COALESCE(p.excluido, f.excluido_manualmente, false) END) = TRUE
              ${faturamentoServiceFilterSql}
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
                SUM(${emissionTotalWeightSql}) AS peso_entrada,
                SUM(
                    CAST(COALESCE(p.data->>'VALOR_PPR','0') AS NUMERIC) *
                    CAST(COALESCE(p.data->>'QUANTIDADE_PPR','0') AS NUMERIC)
                ) AS valor_entrada
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${emissionFichaJoinSql}
            ${emissionPedidoPesoJoinSql}
            WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1
              AND p.data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
              ${emissionServiceFilterSql}
            GROUP BY 1 ORDER BY 1
        `;

        const faturamentosQuery = `
            WITH fat_peso_overrides AS (
                SELECT fp.item_key, fp.item_value::boolean AS fat_peso
                FROM app_preferences p
                CROSS JOIN LATERAL jsonb_each_text(COALESCE(p.value, '{}'::jsonb)) AS fp(item_key, item_value)
                WHERE p.key = 'fat_peso_overrides'
            )
            SELECT
                EXTRACT(MONTH FROM f.data_faturamento)::int AS mes,
                SUM(COALESCE(f.peso_un, 0) * COALESCE(f.quantidade, 0)) AS peso_saida,
                SUM(f.valor_unitario * f.quantidade) AS valor_saida
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            LEFT JOIN fat_peso_overrides o
                ON o.item_key = CONCAT(
                    f.nota_fiscal,
                    '-',
                    COALESCE(TRIM(f.codigo_item), ''),
                    '-',
                    COALESCE(TRIM(f.pedido), ''),
                    '-',
                    f.data_faturamento::date,
                    '-',
                    COALESCE(f.quantidade, 0)
                )
            WHERE EXTRACT(YEAR FROM f.data_faturamento) = $1
              AND f.data_faturamento IS NOT NULL
              AND COALESCE(o.fat_peso, CASE WHEN f.gera_financeiro = 'N' THEN false ELSE NOT COALESCE(p.excluido, f.excluido_manualmente, false) END) = TRUE
              ${faturamentoServiceFilterSql}
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
                ${emissionTotalWeightSql} AS peso_total
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${emissionFichaJoinSql}
            ${emissionPedidoPesoJoinSql}
            WHERE (p.data->>'DATA_EMISSAO_PEDIDO')::date = $1
              ${emissionServiceFilterSql}
            ORDER BY cliente, codigo
        `;

        const faturamentosQuery = `
            WITH fat_peso_overrides AS (
                SELECT fp.item_key, fp.item_value::boolean AS fat_peso
                FROM app_preferences p
                CROSS JOIN LATERAL jsonb_each_text(COALESCE(p.value, '{}'::jsonb)) AS fp(item_key, item_value)
                WHERE p.key = 'fat_peso_overrides'
            )
            SELECT
                TRIM(COALESCE(f.pedido,''))  AS pedido,
                CAST(f.codigo_item AS TEXT)  AS codigo,
                f.descricao,
                f.cliente_nome               AS cliente,
                f.quantidade,
                COALESCE(f.peso_un, 0) * COALESCE(f.quantidade, 0) AS peso_total
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            LEFT JOIN fat_peso_overrides o
                ON o.item_key = CONCAT(
                    f.nota_fiscal,
                    '-',
                    COALESCE(TRIM(f.codigo_item), ''),
                    '-',
                    COALESCE(TRIM(f.pedido), ''),
                    '-',
                    f.data_faturamento::date,
                    '-',
                    COALESCE(f.quantidade, 0)
                )
            WHERE f.data_faturamento = $1
              AND COALESCE(o.fat_peso, CASE WHEN f.gera_financeiro = 'N' THEN false ELSE NOT COALESCE(p.excluido, f.excluido_manualmente, false) END) = TRUE
              ${faturamentoServiceFilterSql}
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

