const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

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
                updated_at as "UPDATED_AT"
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
                miniatura_link as "MINIATURA_LINK"
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

module.exports = router;
