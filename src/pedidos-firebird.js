const express = require('express');
const router = express.Router();
const { Firebird, options: firebirdOptions } = require('../lib/firebird-helper');
const pool = require('../lib/db'); // Adicionado para consulta no Postgres

/**
 * Função utilitária para executar queries no Firebird com tratamento de erros
 * e tentativa de reconexão automática.
 */
async function executeQuery(query, params = []) {
    let lastError = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let dbConn = null;
        try {
            if (attempt > 1) {
                console.log(`🔄 [Firebird] Tentativa ${attempt}/${maxRetries} após erro...`);
                await new Promise(resolve => setTimeout(resolve, 1500 * (attempt - 1))); // Incremental delay
            }

            const db = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout de conexão com Firebird')), 12000);
                Firebird.attach(firebirdOptions, (err, db) => {
                    clearTimeout(timeout);
                    if (err) reject(err);
                    else resolve(db);
                });
            });

            dbConn = db;

            const result = await new Promise((resolve, reject) => {
                db.query(query, params, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });

            return result;

        } catch (err) {
            lastError = err;
            console.error(`❌ [Firebird] Erro na tentativa ${attempt}:`, err.message);

            // Verifica se é um erro que vale a pena tentar novamente (rede/timeout)
            const isRetryable = ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'Timeout', 'Network'].some(
                msg => err.message.includes(msg) || (err.code && String(err.code).includes(msg))
            );

            if (!isRetryable) break;
        } finally {
            if (dbConn) {
                try {
                    dbConn.detach();
                } catch (e) {
                    console.warn('⚠️ Erro ao fechar conexão Firebird:', e.message);
                }
            }
        }
    }

    throw lastError;
}

// GET /api/pedidos-firebird/emissao-mensal
// Retorna o valor e peso total de pedidos emitidos por mês/ano
router.get('/emissao-mensal', async (req, res) => {
    try {
        console.log('📊 [API] Recebida requisição para histórico de emissão.');
        const { anoInicio } = req.query;
        const startYear = parseInt(anoInicio) || 2024;

        const query = `
            SELECT 
                EXTRACT(YEAR FROM p.EMISSAO_PED) as ANO,
                EXTRACT(MONTH FROM p.EMISSAO_PED) as MES,
                COUNT(p.CODIGO_PED) as TOTAL_PEDIDOS,
                SUM(p.TOTAL_PEDIDO_PED) as TOTAL_VALOR,
                SUM(COALESCE(p.PESO_LIQUIDO_PED, 0)) as TOTAL_PESO_LIQUIDO,
                SUM(COALESCE(p.PESO_BRUTO_PED, 0)) as TOTAL_PESO_BRUTO
            FROM PEDIDO p
            WHERE EXTRACT(YEAR FROM p.EMISSAO_PED) >= ${startYear}
              AND p.STATUS_PED <> 'C' 
            GROUP BY 1, 2
            ORDER BY 1 DESC, 2 DESC
        `;

        const result = await executeQuery(query);
        console.log(`✅ [API] Sucesso! ${result.length} registros encontrados.`);

        const dataFormatted = result.map(row => ({
            ano: row.ANO,
            mes: row.MES,
            totalPedidos: row.TOTAL_PEDIDOS,
            totalValor: row.TOTAL_VALOR,
            totalPeso: row.TOTAL_PESO_LIQUIDO,
            totalPesoBruto: row.TOTAL_PESO_BRUTO
        }));

        res.json(dataFormatted);

    } catch (error) {
        console.error('❌ [API] Erro ao buscar emissão:', error);
        res.status(500).json({ error: 'Erro ao conectar no banco de dados', details: error.message });
    }
});

// GET /api/pedidos-firebird/op-apontamentos
// Retorna o detalhamento de apontamentos de uma OP agrupado por setor (Busca do POSTGRES)
router.get('/op-apontamentos', async (req, res) => {
    try {
        const { op } = req.query;
        if (!op) {
            return res.status(400).json({ error: 'Número da OP é obrigatório' });
        }

        console.log(`📊 [API-POSTGRES] Buscando apontamentos para OP: ${op}`);

        // Totais completos (histórico total) do firebird_sync_pedidos
        const totalsResult = await pool.query(
            `SELECT data FROM firebird_sync_pedidos WHERE sync_key = $1`,
            [`OP-${op}`]
        );

        // Última data por grupo de setor da tabela detalhada (apenas 2026+)
        const datesResult = await pool.query(`
            SELECT setor, MAX(data_producao) as data
            FROM producao_apontada_sincronizada
            WHERE op = $1
            GROUP BY setor
        `, [op]);

        const lastDateBySetor = {};
        datesResult.rows.forEach(r => { lastDateBySetor[r.setor] = r.data; });

        // Mapeamento de chave QTY_* → nome canônico do setor e aliases para buscar data
        const sectorDef = [
            { key: 'QTY_MOLDADA',    refugoKey: 'REFUGO_MOLDAGEM',   setor: 'MOLDAGEM PESADA',         aliases: ['MOLDAGEM LEVE', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA', 'MOLDAGEM MECANIZADA', 'MOLDAGEM EM AREIA', 'MOLDAGEM'] },
            { key: 'QTY_FUSAO',      refugoKey: 'REFUGO_FUSAO',      setor: 'FUSAO',                   aliases: ['FUSAO', 'FUSÃO', 'FUNDIÇÃO', 'FUNDICAO'] },
            { key: 'QTY_ACABAMENTO', refugoKey: 'REFUGO_ACABAMENTO', setor: 'ACABAMENTO',              aliases: ['ACABAMENTO', 'REBARBAÇÃO', 'REBARBACAO', 'GRALHA'] },
            { key: 'QTY_TT',         refugoKey: 'REFUGO_TT',         setor: 'TRATAMENTO TERMICO',      aliases: ['TRATAMENTO TERMICO', 'TRATAMENTO TÉRMICO', 'NORMALIZACAO', 'TEMPERA'] },
            { key: 'QTY_USINAGEM',   refugoKey: 'REFUGO_USINAGEM',   setor: 'USINAGEM',                aliases: ['USINAGEM', 'TORNEARIA', 'USINAGEM EXPEDICAO'] },
            { key: 'QTY_QUALIDADE',  refugoKey: 'REFUGO_QUALIDADE',  setor: 'INSPECAO DE QUALIDADE',   aliases: ['INSPECAO DE QUALIDADE', 'INSPEÇÃO DE QUALIDADE', 'QUALIDADE', 'REVISÃO', 'PRODUZIDA / INSPECIONADO'] },
            { key: 'QTY_EXPEDICAO',  refugoKey: 'REFUGO_EXPEDICAO',  setor: 'EXPEDICAO',               aliases: ['EXPEDICAO', 'EXPEDIÇÃO', 'LOGÍSTICA'] },
            { key: 'QTY_FATURAMENTO',refugoKey: null,                 setor: 'FATURAMENTO',             aliases: ['FATURAMENTO', 'FATURADO', 'NF', 'SAÍDA'] },
        ];

        let opData = null;

        const emissoesResult = await pool.query(
            `SELECT data FROM firebird_sync_emissoes WHERE data->>'OP_PCS' = $1 LIMIT 1`,
            [op]
        );

        if (totalsResult.rows.length) {
            opData = { ...totalsResult.rows[0].data };
            // Mescla com emissoes pegando o max de cada QTY_* — emissoes pode ter
            // dados mais completos (ex: OP marcada 'F' no pedidos mas producao registrada no emissoes)
            if (emissoesResult.rows.length) {
                const eData = emissoesResult.rows[0].data;
                const qtyKeys = ['QTY_MOLDADA','QTY_FUSAO','QTY_ACABAMENTO','QTY_TT','QTY_USINAGEM','QTY_QUALIDADE','QTY_EXPEDICAO','QTY_FATURAMENTO',
                                 'REFUGO_MOLDAGEM','REFUGO_FUSAO','REFUGO_ACABAMENTO','REFUGO_TT','REFUGO_USINAGEM','REFUGO_QUALIDADE','REFUGO_EXPEDICAO'];
                for (const k of qtyKeys) {
                    const a = parseFloat(opData[k] || 0);
                    const b = parseFloat(eData[k] || 0);
                    if (b > a) opData[k] = b;
                }
            }
        } else {
            if (!emissoesResult.rows.length) {
                return res.json([]);
            }
            opData = emissoesResult.rows[0].data;
        }
        const result = [];

        for (const def of sectorDef) {
            const qty = parseFloat(opData[def.key] || 0);
            const refugo = def.refugoKey ? parseFloat(opData[def.refugoKey] || 0) : 0;
            if (qty <= 0 && refugo <= 0) continue;

            // Busca a data mais recente entre todos os aliases
            let lastDate = null;
            for (const alias of def.aliases) {
                const d = lastDateBySetor[alias];
                if (d && (!lastDate || d > lastDate)) lastDate = d;
            }

            result.push({ setor: def.setor, quantidade: qty, refugo, data: lastDate });
        }

        console.log(`✅ [API-POSTGRES] OP ${op}: ${result.length} setores encontrados.`);
        res.json(result);

    } catch (error) {
        console.error('❌ [API-POSTGRES] Erro ao buscar apontamentos da OP:', error);
        res.status(500).json({ error: 'Erro ao buscar dados da OP no Postgres', details: error.message });
    }
});

// GET /api/pedidos-firebird/op-setor-detalhes
// Retorna o histórico de apontamentos (data/quantidade) de uma OP em setores específicos
router.get('/op-setor-detalhes', async (req, res) => {
    try {
        const { op, setores } = req.query;
        if (!op || !setores) {
            return res.status(400).json({ error: 'Número da OP e setores são obrigatórios' });
        }

        const sectorList = Array.isArray(setores) ? setores : setores.split(',');

        console.log(`📊 [API-POSTGRES] Buscando histórico detalhado OP: ${op} em ${sectorList.length} setores.`);

        await pool.query(`ALTER TABLE producao_apontada_sincronizada ADD COLUMN IF NOT EXISTS refugo NUMERIC(10,2) DEFAULT 0`);

        const result = await pool.query(`
            SELECT data_producao, setor, quantidade, COALESCE(refugo, 0) as refugo
            FROM producao_apontada_sincronizada
            WHERE op = $1 AND setor = ANY($2)
            ORDER BY data_producao DESC, id DESC
        `, [op, sectorList]);

        res.json(result.rows.map(row => ({
            data: row.data_producao,
            setor: row.setor,
            quantidade: parseFloat(row.quantidade),
            refugo: parseFloat(row.refugo)
        })));

    } catch (error) {
        console.error('❌ [API-POSTGRES] Erro ao buscar histórico da OP:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico no Postgres', details: error.message });
    }
});

// GET /api/pedidos-firebird/op-apontamentos-resumo
// Retorna o resumo de todos os apontamentos por OP e Setor (Otimizado para Dashboard de Monitoramento)
router.get('/op-apontamentos-resumo', async (req, res) => {
    try {
        console.log('📊 [API-POSTGRES] Buscando resumo global de apontamentos...');

        const query = `
            SELECT
                op,
                setor,
                SUM(quantidade) as quantidade,
                MIN(data_producao) as data_inicio,
                MAX(data_producao) as data_fim,
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'data', data_producao,
                        'quantidade', quantidade
                    )
                    ORDER BY data_producao
                ) as lotes
            FROM (
                SELECT
                    op,
                    setor,
                    data_producao::date as data_producao,
                    SUM(quantidade) as quantidade
                FROM producao_apontada_sincronizada
                WHERE op IS NOT NULL
                GROUP BY op, setor, data_producao::date
            ) apontamentos_diarios
            GROUP BY op, setor
        `;

        const result = await pool.query(query);

        // Agrupar por OP no objeto de retorno para facilitar o de/para no frontend
        const summary = {};
        result.rows.forEach(row => {
            if (!summary[row.op]) {
                summary[row.op] = {};
            }
            summary[row.op][row.setor] = {
                quantidade: parseFloat(row.quantidade),
                data_inicio: row.data_inicio,
                data_fim: row.data_fim,
                lotes: row.lotes.map(lote => ({
                    data: lote.data,
                    quantidade: parseFloat(lote.quantidade)
                }))
            };
        });

        console.log(`✅ [API-POSTGRES] Resumo gerado para ${Object.keys(summary).length} OPs.`);
        res.json(summary);

    } catch (error) {
        console.error('❌ [API-POSTGRES] Erro ao buscar resumo de apontamentos:', error);
        res.status(500).json({ error: 'Erro ao processar resumo no Postgres', details: error.message });
    }
});

// GET /api/pedidos-firebird/op-roteiro
// Retorna o roteiro de produção (sequência de setores) de um produto via Ficha Técnica
router.get('/op-roteiro', async (req, res) => {
    try {
        const { produto, cliente, op } = req.query;
        if (!produto && !op) {
            return res.status(400).json({ error: 'Código do produto ou da OP é obrigatório' });
        }

        console.log(`📊 [Postgres] Buscando roteiro: Produto=${produto}, Cliente=${cliente}, OP=${op}`);

        let fichaId = null;

        // 1. Tentar buscar fichaId via OP no Postgres
        if (op) {
            const opRes = await pool.query('SELECT ficha_id FROM producao_fichas WHERE op_codigo = $1', [String(op).trim()]);
            if (opRes.rows.length > 0) {
                fichaId = opRes.rows[0].ficha_id;
                console.log(`🎯 [Postgres] Ficha encontrada via OP ${op}: ${fichaId}`);
            }
        }

        // 2. Fallback: Buscar ficha_id via Produto no Postgres (usando o novo codigo_fic)
        if (!fichaId && produto) {
            const ftRes = await pool.query('SELECT codigo_fic FROM ficha_tecnica WHERE pro_codigo_fic = $1 LIMIT 1', [String(produto).trim()]);
            if (ftRes.rows.length > 0) {
                fichaId = ftRes.rows[0].codigo_fic;
                console.log(`🔍 [Postgres] Ficha encontrada via Produto ${produto}: ${fichaId}`);
            }
        }

        if (!fichaId) {
            console.warn(`⚠️ [Postgres] Nenhuma ficha encontrada para OP=${op} ou Produto=${produto}`);
            return res.json([]);
        }

        // 3. Buscar etapas do roteiro no Postgres
        const routeRes = await pool.query(`
            SELECT sequencia, setor_nome 
            FROM roteiros_tecnicos 
            WHERE ficha_id = $1 
            ORDER BY sequencia
        `, [fichaId]);

        const dataFormatted = routeRes.rows.map(row => ({
            sequencia: row.sequencia,
            setor: row.setor_nome.trim().toUpperCase()
        }));

        console.log(`✅ [Postgres] Roteiro retornado: ${dataFormatted.length} etapas.`);
        res.json(dataFormatted);

    } catch (error) {
        console.error('❌ [Postgres] Erro no roteiro:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/pedidos-firebird/op-roteiro-operacional
// Espelha o roteiro operacional mostrado no Controle de Produção do ERP.
router.get('/op-roteiro-operacional', async (req, res) => {
    try {
        const { op } = req.query;
        if (!op) {
            return res.status(400).json({ error: 'Número da OP é obrigatório' });
        }

        const rows = await executeQuery(`
            SELECT
                PCS.SETOR_PCS AS setor_codigo,
                S.NOME_SET AS setor,
                SUM(PCS.DQUANTIDADE_PCS) AS produzido,
                SUM(PCS.DQUANTIDADE_REFUGO_PCS) AS refugado,
                MAX(PCS.DATA_PCS) AS ultima_data
            FROM PRODUCAO_SETOR PCS
            JOIN SETOR S
              ON S.EMPRESA_SET = PCS.SET_EMPRESA_PCS
             AND S.CODIGO_SET = PCS.SETOR_PCS
            WHERE PCS.EMPRESA_PCS = 10
              AND PCS.CODIGO_PCS = ?
              AND COALESCE(S.NOME_SET, '') NOT LIKE 'NAO USAR%'
              AND COALESCE(S.NOME_SET, '') NOT LIKE 'NÃO USAR%'
            GROUP BY PCS.SETOR_PCS, S.NOME_SET
            ORDER BY
                CASE
                    WHEN PCS.SETOR_PCS = 101 THEN 999
                    ELSE PCS.SETOR_PCS
                END
        `, [parseInt(op, 10)]);

        res.json(rows.map(row => ({
            setor_codigo: row.SETOR_CODIGO,
            setor: String(row.SETOR || '').trim().toUpperCase(),
            produzido: Number(row.PRODUZIDO || 0),
            refugado: Number(row.REFUGADO || 0),
            ultima_data: row.ULTIMA_DATA
        })));
    } catch (error) {
        console.error('❌ [Firebird] Erro no roteiro operacional:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
