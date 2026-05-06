const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { attach } = require('../lib/firebird-helper');

const MOLDAGEM_MAP = { 10: 'MOLDAGEM PESADA', 11: 'MOLDAGEM LEVE', 12: 'MOLDAGEM MANUAL' };

// GET /api/fichatecnica/list/all
router.get('/list/all', async (req, res) => {
    try {
        const sql = `
            SELECT 
                pro_codigo_fic as "PRO_CODIGO_FIC",
                nome_pro as "NOME_PRO",
                cliente_nome as "CLIENTE_NOME",
                material_fic as "MATERIAL_FIC",
                modelo_fic as "MODELO_FIC",
                data_fic as "DATA_FIC",
                updated_at as "UPDATED_AT",
                CASE WHEN detalhes_luvas IS NOT NULL AND detalhes_luvas != '' THEN 'Sim' ELSE 'Não' END as "TEM_LUVAS",
                CASE WHEN detalhes_machos IS NOT NULL AND detalhes_machos != '' THEN 'Sim' ELSE 'Não' END as "TEM_MACHOS",
                CASE WHEN descricao_fic IS NOT NULL AND descricao_fic != '' THEN 'Sim' ELSE 'Não' END as "TEM_NOTAS",
                CASE WHEN foto_base64 IS NOT NULL AND foto_base64 != '' THEN 'Sim' ELSE 'Não' END as "TEM_FOTO"
            FROM ficha_tecnica
            ORDER BY data_fic DESC NULLS LAST, updated_at DESC
        `;
        const result = await pool.query(sql);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao listar faturas:', err);
        res.status(500).json({ error: 'Erro ao listar faturas no servidor.' });
    }
});

// GET /api/fichatecnica/:codigo/fotos
router.get('/:codigo/fotos', async (req, res) => {
    const { codigo } = req.params;
    try {
        const result = await pool.query(
            `SELECT foto_base64 as "FOTO_BASE64", ordem as "ORDEM"
             FROM ficha_tecnica_fotos
             WHERE pro_codigo_fic = $1
             ORDER BY ordem ASC`,
            [codigo]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erro fotos ficha:', err);
        res.status(500).json({ error: 'Erro ao buscar fotos.' });
    }
});

// GET /api/fichatecnica/:codigo
router.get('/:codigo', async (req, res) => {
    const { codigo } = req.params;

    if (!codigo) {
        return res.status(400).json({ error: 'Código é obrigatório' });
    }

    try {
        // Query PostgreSQL - Aliasing for frontend compatibility
        const sql = `
            SELECT 
                pro_codigo_fic as "PRO_CODIGO_FIC",
                nome_pro as "NOME_PRO",
                material_fic as "MATERIAL_FIC",
                peso_liquido_fic as "PESO_LIQUIDO_FIC",
                peso_unit_pcp_fic as "PESO_UNIT_PCP_FIC",
                tipo_moldagem_desc_fic as "TIPO_MOLDAGEM_DESC_FIC",
                operacao_moldagem_desc_fic as "OPERACAO_MOLDAGEM_DESC_FIC",
                descricao_fic as "DESCRICAO_FIC",
                situacao_pro as "SITUACAO_PRO",
                nome_material as "NOME_MATERIAL",
                cliente_nome as "CLIENTE_NOME",
                cli_codigo_fic as "CLI_CODIGO_FIC",
                cli_codgio_fic as "CLI_CODGIO_FIC",
                modelo_fic as "MODELO_FIC",
                peso_bolo_fic as "PESO_BOLO_FIC",
                qtde_caixas_macho as "QTDE_CAIXAS_MACHO",
                pintura_tipo as "PINTURA_TIPO",
                fornecimento_desc as "FORNECIMENTO_DESC",
                peso_penca as "PESO_PENCA",
                peso_com_alimentacao as "PESO_COM_ALIMENTACAO",
                peso_sem_alimentacao as "PESO_SEM_ALIMENTACAO",
                relacao_molde_metal as "RELACAO_MOLDE_METAL",
                peso_tampa as "PESO_TAMPA",
                peso_fundo as "PESO_FUNDO",
                qtde_figuras as "QTDE_FIGURAS",
                tipo_modelo_desc as "TIPO_MODELO_DESC",
                foto_base64 as "FOTO_BASE64",
                peso_machos as "PESO_MACHOS",
                detalhes_machos as "DETALHES_MACHOS",
                tinta_refrataria_fic as "TINTA_REFRATARIA_FIC",
                detalhes_luvas as "DETALHES_LUVAS",
                tipo_ferramental_fic as "TIPO_FERRAMENTAL_FIC",
                miniatura_link as "MINIATURA_LINK",
                lote_pmt as "LOTE_PMT"
            FROM ficha_tecnica
            WHERE pro_codigo_fic = $1
            LIMIT 1
        `;

        const result = await pool.query(sql, [codigo]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ficha Técnica não encontrada no Postgres.' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Postgres query error:', err);
        res.status(500).json({
            error: 'Erro ao consultar Ficha Técnica no Postgres',
            details: err.message
        });
    }
});

// GET /api/fichatecnica/:codigo/tipo-moldagem — busca SET_CODIGO_FTPC do Firebird
router.get('/:codigo/tipo-moldagem', (req, res) => {
    const { codigo } = req.params;
    attach((err, db) => {
        if (err) return res.status(500).json({ error: 'Firebird connection failed' });
        const sql = `
            SELECT FIRST 1 ftp.SET_CODIGO_FTPC
            FROM FICHA_TECNICA_PROCEDIMENTO ftp
            WHERE ftp.FIC_CODIGO_FTPC = ?
              AND ftp.SET_CODIGO_FTPC IN (10, 11, 12)
        `;
        db.query(sql, [codigo], (qErr, rows) => {
            db.detach();
            if (qErr) return res.status(500).json({ error: qErr.message });
            if (!rows || rows.length === 0) return res.json({ tipo_moldagem: null });
            const cod = rows[0].SET_CODIGO_FTPC;
            res.json({ tipo_moldagem: MOLDAGEM_MAP[cod] || null, codigo: cod });
        });
    });
});

module.exports = router;
