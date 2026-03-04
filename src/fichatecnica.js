const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

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
                nome_fic as "NOME_FIC",
                material_fic as "MATERIAL_FIC",
                peso_liquido_fic as "PESO_LIQUIDO_FIC",
                peso_bruto_fic as "PESO_BRUTO_FIC",
                tipo_moldagem_desc_fic as "TIPO_MOLDAGEM_DESC_FIC",
                operacao_moldagem_desc_fic as "OPERACAO_MOLDAGEM_DESC_FIC",
                desenho_int_data_rev_fic as "DESENHO_INT_DATA_REV_FIC",
                descricao_fic as "DESCRICAO_FIC",
                nome_pro as "NOME_PRO",
                peso_liquido_pro as "PESO_LIQUIDO_PRO",
                peso_bruto_pro as "PESO_BRUTO_PRO",
                unidade_pro as "UNIDADE_PRO",
                ncm_pro as "NCM_PRO",
                situacao_pro as "SITUACAO_PRO",
                nome_material as "NOME_MATERIAL"
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
