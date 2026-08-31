const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const OBSERVACOES_PERMITIDAS = new Set([
    'AGUARD. APROVAÇÃO DE AMOSTRA',
    'BLOQUEIO COMERCIAL',
    'SEM FICHA TÉCNICA',
    'AGUARD. RETORNO COMERCIAL',
    'RODANDO AMOSTRA',
    'MODELO NÃO CHEGOU'
]);
const EDIT_ROLES = new Set(['ppcp', 'desenvolvedor']);

// POST /save - Salva ou atualiza uma observação
router.post('/save', async (req, res) => {
    const { sync_key, observacao } = req.body;
    const role = String((req.user && req.user.role) || req.headers['x-role'] || '').trim().toLowerCase();

    if (!sync_key) {
        return res.status(400).json({ error: 'Sync Key é obrigatório' });
    }
    if (!EDIT_ROLES.has(role)) {
        return res.status(403).json({ error: 'Sem permissão para alterar observação' });
    }

    const valor = String(observacao || '').trim().toUpperCase();
    if (valor && !OBSERVACOES_PERMITIDAS.has(valor)) {
        return res.status(400).json({ error: 'Observação inválida' });
    }

    if (valor === 'SEM FICHA TÉCNICA') {
        const ficha = await pool.query(`
            SELECT 1
            FROM firebird_sync_emissoes p
            JOIN ficha_tecnica f ON f.pro_codigo_fic = p.data->>'PRODUTO_PPR'
            WHERE p.sync_key = $1
            LIMIT 1
        `, [String(sync_key)]);
        if (ficha.rowCount) {
            return res.status(409).json({ error: 'Este item já possui ficha técnica' });
        }
    }

    try {
        await pool.query(`
            INSERT INTO pedidos_observacoes (sync_key, observacao, updated_at) 
            VALUES ($1, $2, NOW())
            ON CONFLICT (sync_key) 
            DO UPDATE SET observacao = EXCLUDED.observacao, updated_at = NOW()
        `, [String(sync_key), valor]);

        res.json({ success: true, message: 'Observação salva com sucesso' });
    } catch (err) {
        console.error('Erro ao salvar observação:', err);
        res.status(500).json({ error: 'Erro interno ao salvar observação' });
    }
});

module.exports = router;
