const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// --- ROTA POST: Alternar status de exclusão (Toggle) ---
// MODIFICAÇÃO: Mudado de '/' para '/toggle-exclusion' para corresponder ao frontend
// MODIFICAÇÃO: Invertida a lógica - agora checkbox marcado = INCLUIR = excluido_manualmente = false
router.post('/toggle-exclusion', async (req, res) => {
    const { id, excluded } = req.body;
    const client = await pool.connect();

    try {
        // MODIFICAÇÃO: Invertida a lógica de atualização
        // Se excluded = true (frontend diz que linha está excluída), então excluido_manualmente = true
        // Se excluded = false (frontend diz que linha está incluída), então excluido_manualmente = false
        await client.query(`
            UPDATE faturamento_detalhado 
            SET excluido_manualmente = $1 
            WHERE id = $2
        `, [excluded, id]); // Mantemos o mesmo valor porque agora a lógica está alinhada
        
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("Erro Toggle Faturamento:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;