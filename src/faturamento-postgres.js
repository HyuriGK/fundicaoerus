// src/faturamento-postgres.js
// API para servir dados de faturamento do PostgreSQL (sincronizados do Firebird)
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { logActivity } = require('./lib/logger');

function getCommercialOwnerRestriction(req) {
    const role = String(req.user?.role || '').trim().toLowerCase();
    const username = String(req.user?.user || '').trim().toLowerCase();
    const name = String(req.user?.name || '').trim().toLowerCase();
    if (role === 'comercial' && (username === 'geruza' || name === 'geruza mendes')) return 'GERUZA MENDES';
    if (role === 'comercial' && (username === 'elisangela' || name === 'elisangela')) return 'ELISANGELA';
    return null;
}

function appendCommercialOwnerFilter(query, params, alias, commercialOwner, paramIndex) {
    if (!commercialOwner) return { query, paramIndex };
    query += `
        AND EXISTS (
            SELECT 1
            FROM clientes_firebird_sync c
            JOIN clientes_responsavel_comercial rc
                ON rc.empresa = c.empresa
                AND rc.codigo = c.codigo
            WHERE c.codigo::text = ${alias}.cliente_codigo::text
              AND rc.responsavel_comercial = $${paramIndex}
        )
    `;
    params.push(commercialOwner);
    return { query, paramIndex: paramIndex + 1 };
}

// --- INIT PREFERENCES TABLE ---
(async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS faturamento_firebird_preferencias (
                chave_unica TEXT PRIMARY KEY, 
                excluido BOOLEAN DEFAULT FALSE,
                pedido VARCHAR(50),
                nota_fiscal INTEGER,
                codigo_item VARCHAR(50),
                data_faturamento DATE,
                quantidade DECIMAL(15,3),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`ALTER TABLE faturamento_firebird ADD COLUMN IF NOT EXISTS vendedor_codigo VARCHAR(20)`);
        await client.query(`ALTER TABLE faturamento_firebird ADD COLUMN IF NOT EXISTS vendedor_nome VARCHAR(255)`);
        await client.query(`ALTER TABLE faturamento_firebird ADD COLUMN IF NOT EXISTS valor_item DECIMAL(15, 4) DEFAULT 0`);
        await client.query(`ALTER TABLE faturamento_firebird ADD COLUMN IF NOT EXISTS valor_ipi DECIMAL(15, 4) DEFAULT 0`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS faturamento_vendedores_nota (
                nota_fiscal INTEGER NOT NULL,
                serie VARCHAR(10) NOT NULL DEFAULT '',
                vendedor_codigo VARCHAR(20),
                vendedor_nome VARCHAR(255),
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (nota_fiscal, serie)
            )
        `);
        console.log("✅ Tabela 'faturamento_firebird_preferencias' verificada.");
    } catch (e) {
        console.error("❌ Erro ao criar tabela faturamento_firebird_preferencias:", e);
    } finally {
        client.release();
    }
})();

// GET /api/faturamento-postgres/diario - Faturamento agrupado por dia
router.get('/diario', async (req, res) => {
    try {
        console.log('📊 Consultando faturamento diário do PostgreSQL...');

        const { limit = 90 } = req.query;

        const query = `
            SELECT 
                data,
                total_notas,
                total_itens,
                quantidade_total,
                valor_total,
                peso_total,
                atualizado_em
            FROM faturamento_diario
            ORDER BY data DESC
            LIMIT $1
        `;

        const result = await pool.query(query, [parseInt(limit)]);

        console.log(`✅ ${result.rows.length} dias encontrados`);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                data: row.data,
                totalNotas: parseInt(row.total_notas),
                totalItens: parseInt(row.total_itens),
                quantidadeTotal: parseFloat(row.quantidade_total),
                valorTotal: parseFloat(row.valor_total),
                pesoTotal: parseFloat(row.peso_total || 0)
            }))
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar faturamento diário',
            error: error.message
        });
    }
});

// GET /api/faturamento-postgres/top-produtos - Top produtos mais vendidos
router.get('/top-produtos', async (req, res) => {
    try {
        console.log('🏆 Consultando top produtos do PostgreSQL...');

        const { limit = 10 } = req.query;

        const query = `
            SELECT 
                codigo_produto,
                descricao,
                total_vendas,
                quantidade_total,
                valor_total,
                atualizado_em
            FROM faturamento_top_produtos
            ORDER BY valor_total DESC
            LIMIT $1
        `;

        const result = await pool.query(query, [parseInt(limit)]);

        console.log(`✅ ${result.rows.length} produtos encontrados`);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                codigoProduto: row.codigo_produto,
                descricao: row.descricao,
                totalVendas: parseInt(row.total_vendas),
                quantidadeTotal: parseFloat(row.quantidade_total),
                valorTotal: parseFloat(row.valor_total)
            }))
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar top produtos',
            error: error.message
        });
    }
});

// GET /api/faturamento-postgres/estatisticas - Estatísticas gerais
router.get('/estatisticas', async (req, res) => {
    try {
        console.log('📈 Consultando estatísticas do PostgreSQL...');

        const query = `
            SELECT 
                total_notas,
                total_clientes,
                total_itens,
                quantidade_total,
                valor_total,
                ticket_medio,
                primeira_nota,
                ultima_nota,
                atualizado_em
            FROM faturamento_estatisticas
            WHERE periodo = 'ultimos_90_dias'
            LIMIT 1
        `;

        const result = await pool.query(query);

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    totalNotas: 0,
                    totalClientes: 0,
                    totalItens: 0,
                    quantidadeTotal: 0,
                    valorTotal: 0,
                    ticketMedio: 0,
                    primeiraNota: null,
                    ultimaNota: null
                }
            });
        }

        const stats = result.rows[0];

        console.log(`✅ Estatísticas: R$ ${parseFloat(stats.valor_total).toFixed(2)}`);

        res.json({
            success: true,
            data: {
                totalNotas: parseInt(stats.total_notas),
                totalClientes: parseInt(stats.total_clientes),
                totalItens: parseInt(stats.total_itens),
                quantidadeTotal: parseFloat(stats.quantidade_total),
                valorTotal: parseFloat(stats.valor_total),
                ticketMedio: parseFloat(stats.ticket_medio),
                primeiraNota: stats.primeira_nota,
                ultimaNota: stats.ultima_nota
            }
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar estatísticas',
            error: error.message
        });
    }
});

router.get('/resumo-periodo', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'startDate e endDate sao obrigatorios' });
        }

        const commercialOwner = getCommercialOwnerRestriction(req);
        const params = [startDate, endDate];
        let ownerFilter = '';
        if (commercialOwner) {
            params.push(commercialOwner);
            ownerFilter = `
                AND EXISTS (
                    SELECT 1
                    FROM clientes_firebird_sync c
                    JOIN clientes_responsavel_comercial rc
                        ON rc.empresa = c.empresa
                        AND rc.codigo = c.codigo
                    WHERE c.codigo::text = f.cliente_codigo::text
                      AND rc.responsavel_comercial = $3
                )
            `;
        }

        const result = await pool.query(`
            WITH devolucoes AS (
                SELECT
                    nota_original,
                    COALESCE(TRIM(serie_original), '') AS serie_original,
                    item_original,
                    TRIM(codigo_item) AS codigo_item,
                    SUM(quantidade) AS quantidade_devolvida
                FROM firebird_sync_devolucoes
                WHERE nota_original IS NOT NULL
                GROUP BY nota_original, COALESCE(TRIM(serie_original), ''), item_original, TRIM(codigo_item)
            ),
            base AS (
                SELECT
                    f.data_faturamento::date AS data,
                    CASE
                        WHEN f.gera_financeiro = 'N' THEN true
                        ELSE COALESCE(p.excluido, f.excluido_manualmente)
                    END AS excluido_manualmente,
                    COALESCE(f.peso_un, 0) * GREATEST(f.quantidade - COALESCE(d.quantidade_devolvida, 0), 0) AS peso_total
                FROM faturamento_firebird f
                LEFT JOIN devolucoes d
                    ON d.nota_original = f.nota_fiscal
                    AND d.serie_original = COALESCE(TRIM(f.serie), '')
                    AND d.item_original = f.item_nota
                    AND d.codigo_item = TRIM(f.codigo_item)
                LEFT JOIN faturamento_firebird_preferencias p
                    ON p.nota_fiscal = f.nota_fiscal
                    AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                    AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                    AND p.data_faturamento = f.data_faturamento
                    AND p.quantidade = f.quantidade
                WHERE f.data_faturamento >= $1
                  AND f.data_faturamento <= $2
                  ${ownerFilter}
                  AND f.cliente_codigo::text NOT IN ('257', '432', '2020', '316', '2283', '253')
                  AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%IMEPEL INDUSTRIA MECANICA LTDA%'
                  AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%STEELROOL INDUSTRIA METALURGICA%'
                  AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%SPILROD FUNDICAO DE FERRO E ACO LTDA%'
            )
            SELECT
                data,
                SUM(CASE WHEN excluido_manualmente THEN 0 ELSE peso_total END) AS peso_total
            FROM base
            GROUP BY data
            ORDER BY data
        `, params);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                data: row.data ? row.data.toISOString().split('T')[0] : null,
                pesoTotal: parseFloat(row.peso_total || 0)
            }))
        });
    } catch (error) {
        console.error('Erro resumo-periodo faturamento:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar resumo de faturamento', error: error.message });
    }
});

router.get('/resumo-dashboard', async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10);
        const month = parseInt(req.query.month, 10);
        if (!year || !month || month < 1 || month > 12) {
            return res.status(400).json({ success: false, message: 'year e month sao obrigatorios' });
        }

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        const prevDate = new Date(year, month - 2, 1);
        const prevStart = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;

        const commercialOwner = getCommercialOwnerRestriction(req);
        const params = [startDate, endDate, prevStart];
        let ownerFilter = '';
        if (commercialOwner) {
            params.push(commercialOwner);
            ownerFilter = `
                AND EXISTS (
                    SELECT 1
                    FROM clientes_firebird_sync c
                    JOIN clientes_responsavel_comercial rc
                        ON rc.empresa = c.empresa
                        AND rc.codigo = c.codigo
                    WHERE c.codigo::text = f.cliente_codigo::text
                      AND rc.responsavel_comercial = $4
                )
            `;
        }

        const result = await pool.query(`
            WITH fat_peso_overrides AS (
                SELECT fp.item_key, fp.item_value::boolean AS fat_peso
                FROM app_preferences p
                CROSS JOIN LATERAL jsonb_each_text(COALESCE(p.value, '{}'::jsonb)) AS fp(item_key, item_value)
                WHERE p.key = 'fat_peso_overrides'
            ),
            base AS (
                SELECT
                    f.data_faturamento::date AS data,
                    CASE
                        WHEN o.fat_peso IS NOT NULL THEN o.fat_peso
                        WHEN f.gera_financeiro = 'N' THEN false
                        ELSE NOT COALESCE(p.excluido, f.excluido_manualmente, false)
                    END AS fat_peso,
                    COALESCE(NULLIF(f.peso_un, 0), pc.peso, 0) * COALESCE(f.quantidade, 0) AS peso_total
                FROM faturamento_firebird f
                LEFT JOIN faturamento_firebird_preferencias p
                    ON p.nota_fiscal = f.nota_fiscal
                    AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                    AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                    AND p.data_faturamento = f.data_faturamento
                    AND p.quantidade = f.quantidade
                LEFT JOIN pesos_customizados pc
                    ON pc.codigo = TRIM(f.codigo_item)
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
                WHERE f.data_faturamento >= $3
                  AND f.data_faturamento <= $2
                  ${ownerFilter}
                  AND f.cliente_codigo::text NOT IN ('257', '432', '2020', '316', '2283', '253')
                  AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%IMEPEL INDUSTRIA MECANICA LTDA%'
                  AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%STEELROOL INDUSTRIA METALURGICA%'
                  AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%SPILROD FUNDICAO DE FERRO E ACO LTDA%'
            ),
            clean AS (
                SELECT data, CASE WHEN fat_peso THEN peso_total ELSE 0 END AS peso_total
                FROM base
            )
            SELECT
                data,
                SUM(peso_total) AS peso_total,
                CASE WHEN data >= $1 AND data <= $2 THEN 'current' ELSE 'previous' END AS periodo
            FROM clean
            GROUP BY data, periodo
            ORDER BY data
        `, params);

        let totalKg = 0;
        let previousTotalKg = 0;
        const daily = [];
        result.rows.forEach(row => {
            const peso = parseFloat(row.peso_total || 0);
            if (row.periodo === 'current') {
                totalKg += peso;
                daily.push({ data: row.data ? row.data.toISOString().split('T')[0] : null, pesoTotal: peso });
            } else {
                previousTotalKg += peso;
            }
        });

        res.json({ success: true, totalKg, previousTotalKg, daily });
    } catch (error) {
        console.error('Erro resumo-dashboard faturamento:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar resumo de faturamento do dashboard', error: error.message });
    }
});

// GET /api/faturamento-postgres/detalhado - Dados detalhados (Notas + Itens)
router.get('/detalhado', async (req, res) => {
    try {
        console.log('📝 Consultando faturamento detalhado do PostgreSQL...');

        const { limit = 5000, startDate, endDate } = req.query;
        const commercialOwner = getCommercialOwnerRestriction(req);

        let query = `
            SELECT 
                f.data_faturamento,
                f.nota_fiscal,
                f.serie,
                f.cliente_codigo,
                f.cliente_nome,
                COALESCE(f.vendedor_codigo, v.vendedor_codigo) AS vendedor_codigo,
                COALESCE(f.vendedor_nome, v.vendedor_nome) AS vendedor_nome,
                f.codigo_item,
                f.descricao,
                f.item_nota,
                f.quantidade AS quantidade_original,
                COALESCE(dev.quantidade_devolvida, 0) AS quantidade_devolvida,
                GREATEST(f.quantidade - COALESCE(dev.quantidade_devolvida, 0), 0) AS quantidade,
                f.valor_unitario,
                CASE
                    WHEN f.quantidade > 0 THEN COALESCE(NULLIF(f.valor_item, 0), f.valor_unitario * f.quantidade) * GREATEST(f.quantidade - COALESCE(dev.quantidade_devolvida, 0), 0) / f.quantidade
                    ELSE 0
                END AS valor_item,
                CASE
                    WHEN f.quantidade > 0 THEN COALESCE(f.valor_ipi, 0) * GREATEST(f.quantidade - COALESCE(dev.quantidade_devolvida, 0), 0) / f.quantidade
                    ELSE 0
                END AS valor_ipi,
                CASE
                    WHEN f.quantidade > 0 THEN COALESCE(NULLIF(f.valor_total, 0), f.valor_unitario * f.quantidade) * GREATEST(f.quantidade - COALESCE(dev.quantidade_devolvida, 0), 0) / f.quantidade
                    ELSE 0
                END AS valor_total,
                COALESCE(NULLIF(f.valor_total, 0), f.valor_unitario * f.quantidade) AS valor_total_original,
                COALESCE(NULLIF(f.peso_un, 0), pc.peso, 0) AS peso_un,
                COALESCE(NULLIF(ft.nome_material, ''), NULLIF(ft.material_fic, '')) AS material,
                pg.grupo_material,
                (COALESCE(NULLIF(f.peso_un, 0), pc.peso, 0) * GREATEST(f.quantidade - COALESCE(dev.quantidade_devolvida, 0), 0)) AS peso_total,
                (COALESCE(NULLIF(f.peso_un, 0), pc.peso, 0) * f.quantidade) AS peso_total_original,
                f.status,
                f.pedido,
                ped.ano_pedido,
                ped.ordem_compra,
                ped.data_emissao_pedido,
                ped.quantidade_pedido,
                f.gera_financeiro,
                -- gera_financeiro='N' tem prioridade máxima; senão usa preferência do usuário
                CASE
                    WHEN f.gera_financeiro = 'N' THEN true
                    ELSE COALESCE(p.excluido, f.excluido_manualmente)
                END as excluido_manualmente
            FROM faturamento_firebird f
            LEFT JOIN (
                SELECT
                    nota_original,
                    COALESCE(TRIM(serie_original), '') AS serie_original,
                    item_original,
                    TRIM(codigo_item) AS codigo_item,
                    SUM(quantidade) AS quantidade_devolvida
                FROM firebird_sync_devolucoes
                WHERE nota_original IS NOT NULL
                GROUP BY
                    nota_original,
                    COALESCE(TRIM(serie_original), ''),
                    item_original,
                    TRIM(codigo_item)
            ) dev
                ON dev.nota_original = f.nota_fiscal
                AND dev.serie_original = COALESCE(TRIM(f.serie), '')
                AND dev.item_original = f.item_nota
                AND dev.codigo_item = TRIM(f.codigo_item)
            LEFT JOIN faturamento_firebird_preferencias p 
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            LEFT JOIN faturamento_vendedores_nota v
                ON v.nota_fiscal = f.nota_fiscal
                AND v.serie = COALESCE(TRIM(f.serie), '')
            LEFT JOIN ficha_tecnica ft
                ON ft.pro_codigo_fic = TRIM(f.codigo_item)
            LEFT JOIN pesos_customizados pc
                ON pc.codigo = TRIM(f.codigo_item)
            LEFT JOIN (
                SELECT DISTINCT ON (TRIM(codigo_peca))
                    TRIM(codigo_peca) AS codigo_peca,
                    grupo_material
                FROM producao_apontada_sincronizada
                WHERE grupo_material IS NOT NULL
                  AND grupo_material <> ''
                  AND codigo_peca IS NOT NULL
                  AND TRIM(codigo_peca) <> ''
                ORDER BY TRIM(codigo_peca), data_producao DESC
            ) pg
                ON pg.codigo_peca = TRIM(f.codigo_item)
            LEFT JOIN (
                SELECT DISTINCT ON (data->>'ANO_PPR', data->>'CODIGO_PPR', data->>'PRODUTO_PPR')
                    data->>'ANO_PPR' AS ano_pedido,
                    data->>'CODIGO_PPR' AS pedido,
                    data->>'PRODUTO_PPR' AS codigo_item,
                    NULLIF(TRIM(data->>'ORDEM_COMPRA_PPR'), '') AS ordem_compra,
                    (data->>'DATA_EMISSAO_PEDIDO')::date AS data_emissao_pedido,
                    NULLIF(data->>'QUANTIDADE_PPR', '')::numeric AS quantidade_pedido
                FROM firebird_sync_emissoes
                WHERE data->>'ANO_PPR' IS NOT NULL
                  AND data->>'CODIGO_PPR' IS NOT NULL
                  AND data->>'PRODUTO_PPR' IS NOT NULL
                ORDER BY data->>'ANO_PPR', data->>'CODIGO_PPR', data->>'PRODUTO_PPR', updated_at DESC
            ) ped
                ON ped.pedido = TRIM(f.pedido)
                AND ped.codigo_item = TRIM(f.codigo_item)
                AND ped.ano_pedido = EXTRACT(YEAR FROM f.data_faturamento)::text
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;
        ({ query, paramIndex } = appendCommercialOwnerFilter(query, params, 'f', commercialOwner, paramIndex));

        if (startDate) {
            query += ` AND f.data_faturamento >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND f.data_faturamento <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (req.query.search) {
            const search = req.query.search.toLowerCase();
            query += ` AND (
                LOWER(f.cliente_nome) LIKE $${paramIndex} OR 
                LOWER(f.descricao) LIKE $${paramIndex} OR
                LOWER(COALESCE(f.vendedor_nome, v.vendedor_nome, '')) LIKE $${paramIndex} OR
                CAST(f.nota_fiscal AS TEXT) LIKE $${paramIndex}
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY f.data_faturamento DESC, f.nota_fiscal DESC`;

        // Apply limit if provided (and safe)
        if (limit) {
            query += ` LIMIT $${paramIndex}`;
            params.push(parseInt(limit));
        }

        const result = await pool.query(query, params);

        console.log(`✅ ${result.rows.length} registros detalhados encontrados`);

        // Formatar para o frontend (camelCase)
        const dataFormatted = result.rows.map(row => ({
            data: row.data_faturamento ? row.data_faturamento.toISOString().split('T')[0] : null,
            notaFiscal: row.nota_fiscal,
            serie: row.serie,
            clienteCodigo: row.cliente_codigo,
            clienteNome: row.cliente_nome,
            vendedorCodigo: row.vendedor_codigo,
            vendedorNome: row.vendedor_nome,
            itemNota: row.item_nota,
            codigoItem: row.codigo_item,
            descricao: row.descricao,
            quantidadeOriginal: parseFloat(row.quantidade_original || 0),
            quantidadeDevolvida: parseFloat(row.quantidade_devolvida || 0),
            quantidade: parseFloat(row.quantidade || 0),
            valorUnitario: parseFloat(row.valor_unitario || 0),
            valorItem: parseFloat(row.valor_item || 0),
            valorIpi: parseFloat(row.valor_ipi || 0),
            valorTotal: parseFloat(row.valor_total || 0),
            valorTotalOriginal: parseFloat(row.valor_total_original || 0),
            pesoUn: parseFloat(row.peso_un || 0),
            material: row.material || '',
            grupoMaterial: row.grupo_material || '',
            pesoTotal: parseFloat(row.peso_total || 0),
            pesoTotalOriginal: parseFloat(row.peso_total_original || 0),
            status: row.status,
            pedido: row.pedido,
            pedidoAno: row.ano_pedido,
            ordemCompra: row.ordem_compra,
            dataEmissaoPedido: row.data_emissao_pedido ? row.data_emissao_pedido.toISOString().split('T')[0] : null,
            quantidadePedido: parseFloat(row.quantidade_pedido || 0),
            gera_financeiro: row.gera_financeiro,
            excluido_manualmente: row.excluido_manualmente // Mantemos snake case aqui para compatibilidade com o frontend
        }));

        res.json({
            success: true,
            data: dataFormatted
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados detalhados',
            error: error.message
        });
    }
});

// GET /api/faturamento-postgres/evolucao-mensal - Evolução anual em peso (Com filtros)
router.get('/evolucao-mensal', async (req, res) => {
    try {
        console.log('📅 Consultando evolução mensal filtrada (Peso) do PostgreSQL...');

        // 1. Buscar Preferências de Clientes Excluídos
        const prefRes = await pool.query("SELECT value FROM app_preferences WHERE key = 'excluded_clients'");
        const excludedClients = prefRes.rows[0]?.value ? prefRes.rows[0].value.map(c => c.trim().toUpperCase()) : [];
        const commercialOwner = getCommercialOwnerRestriction(req);
        const params = [excludedClients];
        let ownerCondition = '';
        if (commercialOwner) {
            params.push(commercialOwner);
            ownerCondition = `
                AND EXISTS (
                    SELECT 1
                    FROM clientes_firebird_sync c
                    JOIN clientes_responsavel_comercial rc
                        ON rc.empresa = c.empresa
                        AND rc.codigo = c.codigo
                    WHERE c.codigo::text = f.cliente_codigo::text
                      AND rc.responsavel_comercial = $2
                )
            `;
        }

        // 2. Query que gera os meses e soma os dados filtrados
        // Priorizamos a tabela detalhada (faturamento_firebird) em vez da faturamento_diario 
        // para podermos aplicar os mesmos filtros de cliente e pedido do dashboard.
        const query = `
            WITH meses AS (
                SELECT generate_series(
                    '2025-01-01'::DATE,
                    DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '11 months',
                    INTERVAL '1 month'
                )::DATE as mes
            )
            SELECT 
                m.mes,
                COALESCE(SUM(f.peso_un * f.quantidade), 0) as peso_total,
                COALESCE(SUM(
                    COALESCE(NULLIF(f.valor_total, 0), f.valor_unitario * f.quantidade)
                ), 0) as valor_total
            FROM meses m
            LEFT JOIN faturamento_firebird f 
                ON DATE_TRUNC('month', f.data_faturamento) = m.mes
                AND (f.excluido_manualmente = FALSE OR f.excluido_manualmente IS NULL)
                AND NOT (UPPER(TRIM(f.cliente_nome)) = ANY($1))
                ${ownerCondition}
            LEFT JOIN (
                SELECT
                    nota_original,
                    COALESCE(TRIM(serie_original), '') AS serie_original,
                    item_original,
                    TRIM(codigo_item) AS codigo_item,
                    SUM(quantidade) AS quantidade_devolvida
                FROM firebird_sync_devolucoes
                WHERE nota_original IS NOT NULL
                GROUP BY
                    nota_original,
                    COALESCE(TRIM(serie_original), ''),
                    item_original,
                    TRIM(codigo_item)
            ) dev
                ON dev.nota_original = f.nota_fiscal
                AND dev.serie_original = COALESCE(TRIM(f.serie), '')
                AND dev.item_original = f.item_nota
                AND dev.codigo_item = TRIM(f.codigo_item)
            GROUP BY m.mes
            ORDER BY m.mes
        `;

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                mes: row.mes,
                mesNome: row.mes.toLocaleString('pt-BR', { month: 'long' }),
                pesoTotal: parseFloat(row.peso_total),
                valorTotal: parseFloat(row.valor_total)
            }))
        });

    } catch (error) {
        console.error('❌ Erro ao buscar evolução mensal filtrada:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar evolução mensal',
            error: error.message
        });
    }
});

// --- ROTA POST: Toggle Exclusão (Sincronizado) ---
router.post('/toggle-exclusion', async (req, res) => {
    const { key, excluded, nota_fiscal, serie, item_nota, codigo_item, cliente_codigo } = req.body;

    if (!key) return res.status(400).json({ error: "Chave inválida" });

    // DEBUG LOG
    console.log("🐛 RECEIVED TOGGLE:", { key, excluded, nota_fiscal, serie, codigo_item });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Salva na tabela global de memórias (PREFERÊNCIAS)
        // Nova Lógica (B): Usa colunas estruturadas em vez de chave string
        await client.query(`
            INSERT INTO faturamento_firebird_preferencias 
                (chave_unica, excluido, pedido, nota_fiscal, codigo_item, data_faturamento, quantidade)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (chave_unica) 
            DO UPDATE SET 
                excluido = EXCLUDED.excluido, 
                pedido = EXCLUDED.pedido, 
                nota_fiscal = EXCLUDED.nota_fiscal,
                codigo_item = EXCLUDED.codigo_item,
                data_faturamento = EXCLUDED.data_faturamento,
                quantidade = EXCLUDED.quantidade,
                updated_at = CURRENT_TIMESTAMP
        `, [key, excluded, req.body.pedido || null, nota_fiscal, codigo_item, req.body.data_faturamento, req.body.quantidade]);

        // 2. Atualiza a tabela sincronizada local se os dados forem passados
        if (nota_fiscal !== undefined) {
            let updateQuery = `
                UPDATE faturamento_firebird 
                SET excluido_manualmente = $1 
                WHERE nota_fiscal = $2 
                  AND codigo_item = $3
            `;
            const params = [excluded, nota_fiscal, codigo_item];

            // FORCE Pedido matching (treat null as empty string to match Key Generation logic)
            // Key = Nota-Code-Pedido(or empty)
            const pedidoValid = req.body.pedido || '';
            updateQuery += ` AND COALESCE(pedido, '') = $${params.length + 1}`;
            params.push(pedidoValid);

            if (cliente_codigo) {
                updateQuery += ` AND cliente_codigo = $${params.length + 1}`;
                params.push(cliente_codigo);
            }

            await client.query(updateQuery, params);
        }

        await client.query('COMMIT');
        logActivity(req.user && req.user.name || 'Desconhecido', excluded ? 'EXCLUIR_ITEM_FAT' : 'INCLUIR_ITEM_FAT', 'faturamento_firebird', {
            cliente: req.body.cliente_nome || null, nota_fiscal, codigo_item, pedido: req.body.pedido || null, quantidade: req.body.quantidade
        });
        return res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erro ao salvar exclusão sincronizada:", error);
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;
