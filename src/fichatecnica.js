const express = require('express');
const router = express.Router();
const Firebird = require('node-firebird');

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

// GET /api/fichatecnica/:codigo
router.get('/:codigo', async (req, res) => {
    const { codigo } = req.params;

    if (!codigo) {
        return res.status(400).json({ error: 'Código é obrigatório' });
    }

    Firebird.attach(options, function (err, db) {
        if (err) {
            console.error('Firebird attach error:', err);
            return res.status(500).json({ error: 'Erro ao conectar ao Firebird' });
        }

        // Query for Ficha Técnica data
        const sql = `
            SELECT FIRST 1
                F.*,
                P.NOME_PRO,
                P.PESO_LIQUIDO_PRO,
                P.PESO_BRUTO_PRO,
                P.UNIDADE_PRO,
                P.NCM_PRO,
                M.MATERIAL_MAT as NOME_MATERIAL
            FROM FICHA_TECNICA F
            LEFT JOIN PRODUTO P ON P.CODIGO_PRO = F.PRO_CODIGO_FIC
            LEFT JOIN MATERIAL M ON M.CODIGO_MAT = P.MAT_CODIGO_PRO
            WHERE F.PRO_CODIGO_FIC = ?
        `;

        db.query(sql, [codigo], function (err, result) {
            if (err) {
                console.error('Firebird query error:', err);
                db.detach();
                return res.status(500).json({ error: 'Erro ao consultar Ficha Técnica' });
            }

            if (!result || result.length === 0) {
                db.detach();
                return res.status(404).json({ error: 'Ficha Técnica não encontrada para o código informado.' });
            }

            const data = result[0];
            db.detach();
            res.json(data);
        });
    });
});

module.exports = router;
