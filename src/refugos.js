// src/refugos.js
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

// --- INIT MAPPING TABLE ---
(async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS refugo_mapeamento_setores (
                motivo TEXT PRIMARY KEY,
                setor_responsavel TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Tabela 'refugo_mapeamento_setores' verificada.");
    } catch (e) {
        console.error("❌ Erro ao criar tabela refugo_mapeamento_setores:", e);
    } finally {
        client.release();
    }
})();

// --- ROTA GET: Carregar dados sincronizados com Mapeamento Manual ---
router.get('/', async (req, res) => {
    const client = await pool.connect();

    try {
        const commercialOwner = getCommercialOwnerRestriction(req);
        const params = commercialOwner ? [commercialOwner] : [];
        const ownerFilter = commercialOwner ? `
            AND EXISTS (
                SELECT 1
                FROM clientes_firebird_sync c
                JOIN clientes_responsavel_comercial rc
                  ON rc.empresa = c.empresa
                 AND rc.codigo = c.codigo
                 AND rc.responsavel_comercial = $1
                WHERE UPPER(TRIM(c.razao_social)) = UPPER(TRIM(r.cliente))
            )
        ` : '';

        // Fetch synchronized scrap data JOINED with manual mapping
        const dados = await client.query(`
            SELECT 
                r.chave_origem AS id, 
                r.setor, 
                to_char(r.data_refugo, 'YYYY-MM-DD') as data, 
                r.produto as descricao, 
                r.codigo_peca, 
                r.lote, 
                r.quantidade, 
                r.peso_un, 
                r.peso_total,
                r.op,
                r.motivo,
                r.cliente,
                m.setor_responsavel,
                f.material_fic as material,
                COALESCE(vp.valor_ppr, 0) as valor_unitario
            FROM refugo_apontado_sync r
            LEFT JOIN refugo_mapeamento_setores m ON r.motivo = m.motivo
            LEFT JOIN ficha_tecnica f ON r.codigo_peca = f.pro_codigo_fic
            LEFT JOIN (
                SELECT DISTINCT ON (TRIM(e.data->>'PRODUTO_PPR'))
                    TRIM(e.data->>'PRODUTO_PPR') AS codigo_peca,
                    REPLACE(TRIM(e.data->>'VALOR_PPR'), ',', '.')::numeric AS valor_ppr
                FROM firebird_sync_emissoes e
                WHERE COALESCE(TRIM(e.data->>'PRODUTO_PPR'), '') <> ''
                  AND TRIM(e.data->>'VALOR_PPR') ~ '^[0-9]+([,.][0-9]+)?$'
                  AND REPLACE(TRIM(e.data->>'VALOR_PPR'), ',', '.')::numeric > 0
                ORDER BY TRIM(e.data->>'PRODUTO_PPR'), e.updated_at DESC
            ) vp ON vp.codigo_peca = TRIM(r.codigo_peca)
            WHERE r.batch_id = (SELECT batch_id FROM refugos_sync_batches WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1)
            ${ownerFilter}
            ORDER BY r.data_refugo DESC
        `, params);

        let prodMap = {};

        const producaoAgg = await client.query(`
            SELECT 
                to_char(t.data_producao, 'YYYY-MM') as mes_ano, 
                SUM(COALESCE(t.peso_total, 0)) as total_peso
            FROM producao_apontada_sincronizada t
            WHERE t.data_producao >= '2025-01-01'
              AND UPPER(TRIM(t.setor)) = 'FUSAO'
              AND TRIM(t.codigo_peca) NOT IN ('18358', '801032102')
            GROUP BY 1
        `);

        producaoAgg.rows.forEach(r => {
            prodMap[r.mes_ano] = parseFloat(r.total_peso);
        });

        return res.status(200).json({
            refugoRawData: dados.rows,
            refugoMonthlyProduction: prodMap
        });

    } catch (error) {
        console.error("Erro GET Refugos:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// --- ROTA GET: Listar Motivos Únicos ---
router.get('/resumo-dashboard', async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10);
        const month = parseInt(req.query.month, 10);
        if (!year || !month || month < 1 || month > 12) {
            return res.status(400).json({ success: false, message: 'year e month sao obrigatorios' });
        }

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        const prodKey = `${year}-${String(month).padStart(2, '0')}`;

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
                     AND rc.responsavel_comercial = $3
                    WHERE UPPER(TRIM(c.razao_social)) = UPPER(TRIM(r.cliente))
                )
            `;
        }

        const [scrapResult, productionResult] = await Promise.all([
            pool.query(`
                SELECT
                    UPPER(TRIM(COALESCE(r.motivo, 'NAO INFORMADO'))) AS motivo,
                    SUM(r.quantidade * COALESCE(pc.peso, r.peso_un, 0)) AS peso_total
                FROM refugo_apontado_sync r
                LEFT JOIN pesos_customizados pc ON r.codigo_peca = pc.codigo
                WHERE r.batch_id = (SELECT batch_id FROM refugos_sync_batches WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1)
                  AND r.data_refugo >= $1
                  AND r.data_refugo <= $2
                  ${ownerFilter}
                GROUP BY 1
                ORDER BY peso_total DESC
            `, params),
            pool.query(`
                SELECT SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0)) AS total_peso
                FROM producao_apontada_sincronizada t
                LEFT JOIN pesos_customizados pc ON t.codigo_peca = pc.codigo
                LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
                WHERE to_char(t.data_producao, 'YYYY-MM') = $1
                  AND UPPER(TRIM(t.setor)) = 'FUSAO'
                  AND TRIM(t.codigo_peca) NOT IN ('18358', '801032102')
            `, [prodKey])
        ]);

        const byMotive = {};
        let totalKg = 0;
        scrapResult.rows.forEach(row => {
            const peso = parseFloat(row.peso_total || 0);
            totalKg += peso;
            byMotive[row.motivo] = peso;
        });

        const productionKg = parseFloat(productionResult.rows[0]?.total_peso || 0);
        const scrapPct = productionKg > 0 ? (totalKg / productionKg) * 100 : 0;

        res.json({ success: true, totalKg, productionKg, scrapPct, byMotive });
    } catch (error) {
        console.error('Erro resumo-dashboard refugos:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar resumo de refugo do dashboard', error: error.message });
    }
});

router.get('/motivos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT motivo 
            FROM refugo_apontado_sync
            WHERE batch_id = (SELECT batch_id FROM refugos_sync_batches WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1)
              AND motivo IS NOT NULL
            ORDER BY motivo ASC
        `);
        res.json(result.rows.map(r => r.motivo));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROTA GET: Obter Mapeamento Atual ---
router.get('/mapping', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM refugo_mapeamento_setores');
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROTA POST: Salvar Mapeamento ---
router.post('/mapping', async (req, res) => {
    const { motivo, setor_responsavel } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo obrigatório' });

    try {
        await pool.query(`
            INSERT INTO refugo_mapeamento_setores (motivo, setor_responsavel)
            VALUES ($1, $2)
            ON CONFLICT (motivo) DO UPDATE SET
                setor_responsavel = EXCLUDED.setor_responsavel,
                updated_at = CURRENT_TIMESTAMP
        `, [motivo, setor_responsavel]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
