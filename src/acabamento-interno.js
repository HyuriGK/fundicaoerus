const express = require('express');
const router = express.Router();
const pool = require('../lib/db'); 

// =========================================================================
// FUNÇÕES CONTROLADORAS (Lógica separada para reutilizar nas rotas)
// =========================================================================

// --- Lógica para GET (Leitura) ---
const handleGet = async (req, res) => {
    // Tenta pegar a action da URL (ex: /registros) OU da Query (ex: ?action=registros)
    const action = req.params.action || req.query.action;
    
    const client = await pool.connect();

    try {
        // 1. CARREGAR CONFIGURAÇÕES
        if (action === 'load-last-update') {
            const r = await client.query("SELECT config_value FROM ai_configs WHERE config_key = 'last_updated'");
            const lastUpdated = r.rows.length > 0 ? r.rows[0].config_value.value : null;
            return res.json({ last_updated: lastUpdated });
        }

        if (action === 'load-material-days') {
            const r = await client.query("SELECT config_value FROM ai_configs WHERE config_key = 'material_days'");
            const data = r.rows.length > 0 ? r.rows[0].config_value.data : [];
            return res.json({ materialDays: data });
        }

        if (action === 'load-posterior-correlation') {
            const r = await client.query("SELECT config_value FROM ai_configs WHERE config_key = 'posterior_correlation'");
            const data = r.rows.length > 0 ? r.rows[0].config_value.data : [];
            return res.json({ posteriorCorrelation: data });
        }

        if (action === 'load-config') {
            const key = req.query.config_key;
            const r = await client.query("SELECT config_value FROM ai_configs WHERE config_key = $1", [key]);
            const val = r.rows.length > 0 ? r.rows[0].config_value.value : '';
            return res.json({ config_value: val });
        }

        // 2. LISTAR REGISTROS (MATÉRIA PRIMA)
        if (action === 'registros') {
            const result = await client.query("SELECT to_char(data, 'YYYY-MM-DD') as data, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat FROM ai_raw_data ORDER BY id ASC");
            return res.json(result.rows);
        }

        // 3. CARREGAR AGENDAMENTO DE UM DIA
        if (action === 'get-schedule-day') {
            const { date } = req.query; // Aqui a data provavelmente vem na query mesmo sendo uma rota nomeada
            const query = `SELECT payload FROM ai_daily_schedules WHERE date = $1`;
            const result = await client.query(query, [date]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Programação não encontrada." });
            }
            return res.json(result.rows[0].payload);
        }

        // 4. LISTAR TODOS OS AGENDAMENTOS (MENU LATERAL)
        if (action === 'list-schedules') {
            const r = await client.query("SELECT date, payload FROM ai_daily_schedules ORDER BY date DESC");
            
            const list = r.rows.map(row => {
                const p = row.payload;
                let totalWeight = 0;
                
                if (Array.isArray(p.autoRows)) {
                    p.autoRows.forEach(item => { totalWeight += (parseFloat(item[8]) || 0); });
                }
                
                if (Array.isArray(p.manualRows)) {
                    p.manualRows.forEach(item => { totalWeight += (parseFloat(item[8]) || 0); });
                }

                const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date;

                return {
                    date: dateStr,
                    totalWeight: totalWeight
                };
            });
            
            return res.json(list);
        }

        if (action === 'ops-firebird') {
            // Uma linha por (OP, data_fusao) — quantidade = apontada naquele dia específico
            const result = await client.query(`
                WITH op_base AS (
                    SELECT DISTINCT ON (fsp.sync_key)
                        replace(fsp.sync_key, 'OP-', '')        AS op,
                        fsp.data->>'PRODUTO_PPR'                AS codigo,
                        fsp.data->>'NOME_PRODUTO_PPR'           AS descricao,
                        (fsp.data->>'PESO_PRODUTO')::numeric    AS peso_un,
                        fsp.data->>'LOTE_PCS'                   AS lote,
                        fsp.data->>'NOME_CLIENTE'               AS cliente,
                        fsp.data->>'OP_ENTREGA'                 AS op_entrega,
                        fsp.data->>'STATUS_PCP'                 AS status_pcp,
                        COALESCE(
                            (SELECT e.data->>'NOME_MATERIAL'
                             FROM firebird_sync_emissoes e
                             WHERE e.data->>'PRODUTO_PPR' = fsp.data->>'PRODUTO_PPR'
                               AND e.data->>'NOME_MATERIAL' IS NOT NULL
                               AND e.data->>'NOME_MATERIAL' <> ''
                             LIMIT 1),
                            ''
                        ) AS material,
                        COALESCE(
                            (SELECT pas.grupo_material
                             FROM producao_apontada_sincronizada pas
                             WHERE upper(trim(pas.liga)) = upper(trim(
                                 (SELECT e2.data->>'NOME_MATERIAL'
                                  FROM firebird_sync_emissoes e2
                                  WHERE e2.data->>'PRODUTO_PPR' = fsp.data->>'PRODUTO_PPR'
                                    AND e2.data->>'NOME_MATERIAL' IS NOT NULL
                                    AND e2.data->>'NOME_MATERIAL' <> ''
                                  LIMIT 1)
                             ))
                               AND pas.grupo_material IS NOT NULL
                               AND pas.grupo_material <> ''
                             LIMIT 1),
                            ''
                        ) AS grupo_material
                    FROM firebird_sync_pedidos fsp
                    WHERE fsp.sync_key LIKE 'OP-%'
                    AND trim(fsp.data->>'STATUS_PCP') IN ('N', 'P')
                    AND fsp.updated_at >= (
                        SELECT MAX(updated_at) - INTERVAL '2 hours'
                        FROM firebird_sync_pedidos
                        WHERE sync_key LIKE 'OP-%'
                    )
                    ORDER BY fsp.sync_key, fsp.data->>'OP_ENTREGA' ASC NULLS LAST
                ),
                fusao_por_dia AS (
                    SELECT
                        pas.op,
                        pas.data_producao                       AS data_fusao,
                        SUM(pas.quantidade)                     AS quant_fusao
                    FROM producao_apontada_sincronizada pas
                    WHERE upper(trim(pas.setor)) IN ('FUSAO', 'FUSÃO', 'FUNDICAO', 'FUNDIÇÃO')
                    GROUP BY pas.op, pas.data_producao
                ),
                acabamento_por_fusao AS (
                    -- Para cada (op, data_fusao), soma o acabamento apontado APÓS aquela data de fusão
                    SELECT
                        fd.op,
                        fd.data_fusao,
                        COALESCE(SUM(pa.quantidade), 0) AS quant_acabamento
                    FROM fusao_por_dia fd
                    LEFT JOIN producao_apontada_sincronizada pa
                        ON  pa.op = fd.op
                        AND upper(trim(pa.setor)) IN ('ACABAMENTO', 'REBARBAÇÃO', 'REBARBACAO', 'GRALHA')
                        AND pa.data_producao > fd.data_fusao
                    GROUP BY fd.op, fd.data_fusao
                )
                SELECT
                    ob.op,
                    ob.codigo,
                    ob.descricao,
                    ob.peso_un,
                    ob.lote,
                    ob.cliente,
                    ob.op_entrega,
                    ob.status_pcp,
                    ob.material,
                    ob.grupo_material,
                    fd.data_fusao,
                    GREATEST(0, fd.quant_fusao - af.quant_acabamento) AS quant_fusao
                FROM op_base ob
                JOIN fusao_por_dia fd ON fd.op = ob.op
                JOIN acabamento_por_fusao af ON af.op = fd.op AND af.data_fusao = fd.data_fusao
                ORDER BY fd.data_fusao ASC, ob.op ASC
            `);
            return res.json(result.rows);
        }

        return res.status(400).json({ error: 'Action GET desconhecida: ' + action });

    } catch (e) {
        console.error("Erro GET acabamento-interno:", e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
};

// --- Lógica para POST (Escrita) ---
const handlePost = async (req, res) => {
    const action = req.params.action || req.query.action;
    const client = await pool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS ai_daily_schedules (
                date DATE PRIMARY KEY,
                payload JSONB, 
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 1. SALVAR CONFIGURAÇÕES
        if (action === 'save-config' || action === 'save-last-update' || action === 'save-material-days' || action === 'save-posterior-correlation') {
            let key, value;
            if (action === 'save-last-update') {
                key = 'last_updated';
                value = { value: req.body.last_updated };
            } else if (action === 'save-material-days') {
                key = 'material_days';
                value = { data: req.body.materialDays };
            } else if (action === 'save-posterior-correlation') {
                key = 'posterior_correlation';
                value = { data: req.body.posteriorCorrelation };
            } else {
                key = req.body.config_key;
                value = { value: req.body.config_value };
            }
            
            await client.query(
                'INSERT INTO ai_configs (config_key, config_value) VALUES ($1, $2) ON CONFLICT (config_key) DO UPDATE SET config_value = $2',
                [key, value]
            );
            return res.json({ success: true });
        }

        // 2. IMPORTAR DADOS BRUTOS (EXCEL)
        if (action === 'import-raw') {
            const data = req.body; 
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE ai_raw_data RESTART IDENTITY');
            
            const insertQuery = `
                INSERT INTO ai_raw_data 
                (data, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `;
            
            for (const row of data) {
                const dateVal = (row[0] && row[0] !== '') ? row[0] : null;
                await client.query(insertQuery, [
                    dateVal, row[1], row[2], row[3], row[4], 
                    row[5], row[6], row[7], row[8], row[9], row[10]
                ]);
            }
            await client.query('COMMIT');
            return res.json({ success: true });
        }

        // 3. LIMPAR DADOS BRUTOS
        if (action === 'clear-raw') {
            await client.query('TRUNCATE TABLE ai_raw_data RESTART IDENTITY');
            return res.json({ success: true });
        }

        // 4. SALVAR AGENDAMENTO DIÁRIO
        if (action === 'save-schedule-day') {
            const { date, autoRows, manualRows, observations } = req.body;
            
            const payload = {
                autoRows: autoRows || [],
                manualRows: manualRows || [],
                observations: observations || ""
            };
            
            const query = `
                INSERT INTO ai_daily_schedules (date, payload, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (date) 
                DO UPDATE SET payload = $2, updated_at = NOW()
            `;
            
            await client.query(query, [date, JSON.stringify(payload)]);
            return res.json({ success: true });
        }

        // 5. EXCLUIR AGENDAMENTO
        if (action === 'delete-schedule-day') {
            const { date } = req.body;
            await client.query('DELETE FROM ai_daily_schedules WHERE date = $1', [date]);
            return res.json({ success: true });
        }

        // 6. LEGADO
        if (action === 'save-final') { 
            return res.json({ success: true }); 
        }

        return res.status(400).json({ error: 'Action POST desconhecida: ' + action });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("ERRO POST acabamento-interno:", e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
};

// =========================================================================
// DEFINIÇÃO DAS ROTAS (Aqui está o pulo do gato!)
// =========================================================================

// Agora aceitamos tanto "/api/acabamento-interno/registros" (params)
// Quanto "/api/acabamento-interno?action=registros" (query)

// 1. Rotas com parâmetro dinâmico na URL (ex: /list-schedules)
router.get('/:action', handleGet);
router.post('/:action', handlePost);

// 2. Rotas raiz (ex: ?action=list-schedules)
router.get('/', handleGet);
router.post('/', handlePost);

module.exports = router;