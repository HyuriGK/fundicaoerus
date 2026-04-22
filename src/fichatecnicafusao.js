const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Garante que a tabela existe
async function ensureTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ficha_tecnica_fusao (
            id SERIAL PRIMARY KEY,
            pro_codigo TEXT NOT NULL UNIQUE,
            nome_pro TEXT,
            cliente_nome TEXT,
            cli_codigo TEXT,
            material TEXT,
            liga TEXT,
            temperatura_vazamento TEXT,
            temperatura_saida_forno TEXT,
            tipo_forno TEXT,
            capacidade_forno TEXT,
            tempo_fusao TEXT,
            consumo_especifico TEXT,
            tratamento_metalurgico TEXT,
            inoculante TEXT,
            modificador TEXT,
            escorificante TEXT,
            carga_retorno_pct TEXT,
            carga_sucata_pct TEXT,
            carga_gusa_pct TEXT,
            carga_ligas_pct TEXT,
            analise_quimica TEXT,
            dureza_especificada TEXT,
            ensaios_requeridos TEXT,
            notas TEXT,
            foto_base64 TEXT,
            data_ficha DATE,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
}
ensureTable().catch(console.error);

// GET /api/fichatecnicafusao/list/all
router.get('/list/all', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                pro_codigo as "PRO_CODIGO",
                nome_pro as "NOME_PRO",
                cliente_nome as "CLIENTE_NOME",
                material as "MATERIAL",
                liga as "LIGA",
                data_ficha as "DATA_FICHA",
                updated_at as "UPDATED_AT",
                CASE WHEN notas IS NOT NULL AND notas != '' THEN 'Sim' ELSE 'Não' END as "TEM_NOTAS",
                CASE WHEN foto_base64 IS NOT NULL AND foto_base64 != '' THEN 'Sim' ELSE 'Não' END as "TEM_FOTO"
            FROM ficha_tecnica_fusao
            ORDER BY data_ficha DESC NULLS LAST, updated_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao listar fichas fusão:', err);
        res.status(500).json({ error: 'Erro ao listar fichas de fusão.' });
    }
});

// GET /api/fichatecnicafusao/:codigo
router.get('/:codigo', async (req, res) => {
    const { codigo } = req.params;
    try {
        const result = await pool.query(`
            SELECT *,
                peso_liquido as "peso_liquido_pro",
                peso_bruto as "peso_bruto_pro",
                peso_penca as "peso_penca_fic",
                peso_com_alimentacao as "peso_com_alimentacao_fic",
                rendimento_metalico as "rendimento_metalico_fic"
            FROM ficha_tecnica_fusao WHERE pro_codigo = $1 LIMIT 1
        `, [codigo]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ficha de Fusão não encontrada.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao buscar ficha fusão:', err);
        res.status(500).json({ error: 'Erro ao buscar ficha de fusão.' });
    }
});

// POST /api/fichatecnicafusao
router.post('/', async (req, res) => {
    const d = req.body;
    try {
        await pool.query(`
            INSERT INTO ficha_tecnica_fusao (
                pro_codigo, nome_pro, cliente_nome, cli_codigo, material, liga,
                temperatura_vazamento, temperatura_saida_forno, tipo_forno, capacidade_forno,
                tempo_fusao, consumo_especifico, tratamento_metalurgico, inoculante,
                modificador, escorificante, carga_retorno_pct, carga_sucata_pct,
                carga_gusa_pct, carga_ligas_pct, analise_quimica, dureza_especificada,
                ensaios_requeridos, notas, foto_base64, data_ficha, updated_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,NOW()
            )
            ON CONFLICT (pro_codigo) DO UPDATE SET
                nome_pro = EXCLUDED.nome_pro,
                cliente_nome = EXCLUDED.cliente_nome,
                cli_codigo = EXCLUDED.cli_codigo,
                material = EXCLUDED.material,
                liga = EXCLUDED.liga,
                temperatura_vazamento = EXCLUDED.temperatura_vazamento,
                temperatura_saida_forno = EXCLUDED.temperatura_saida_forno,
                tipo_forno = EXCLUDED.tipo_forno,
                capacidade_forno = EXCLUDED.capacidade_forno,
                tempo_fusao = EXCLUDED.tempo_fusao,
                consumo_especifico = EXCLUDED.consumo_especifico,
                tratamento_metalurgico = EXCLUDED.tratamento_metalurgico,
                inoculante = EXCLUDED.inoculante,
                modificador = EXCLUDED.modificador,
                escorificante = EXCLUDED.escorificante,
                carga_retorno_pct = EXCLUDED.carga_retorno_pct,
                carga_sucata_pct = EXCLUDED.carga_sucata_pct,
                carga_gusa_pct = EXCLUDED.carga_gusa_pct,
                carga_ligas_pct = EXCLUDED.carga_ligas_pct,
                analise_quimica = EXCLUDED.analise_quimica,
                dureza_especificada = EXCLUDED.dureza_especificada,
                ensaios_requeridos = EXCLUDED.ensaios_requeridos,
                notas = EXCLUDED.notas,
                foto_base64 = EXCLUDED.foto_base64,
                data_ficha = EXCLUDED.data_ficha,
                updated_at = NOW()
        `, [
            d.pro_codigo, d.nome_pro, d.cliente_nome, d.cli_codigo, d.material, d.liga,
            d.temperatura_vazamento, d.temperatura_saida_forno, d.tipo_forno, d.capacidade_forno,
            d.tempo_fusao, d.consumo_especifico, d.tratamento_metalurgico, d.inoculante,
            d.modificador, d.escorificante, d.carga_retorno_pct, d.carga_sucata_pct,
            d.carga_gusa_pct, d.carga_ligas_pct, d.analise_quimica, d.dureza_especificada,
            d.ensaios_requeridos, d.notas, d.foto_base64, d.data_ficha || null
        ]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao salvar ficha fusão:', err);
        res.status(500).json({ error: 'Erro ao salvar ficha de fusão.' });
    }
});

// DELETE /api/fichatecnicafusao/:codigo
router.delete('/:codigo', async (req, res) => {
    try {
        await pool.query('DELETE FROM ficha_tecnica_fusao WHERE pro_codigo = $1', [req.params.codigo]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao excluir ficha.' });
    }
});

module.exports = router;
