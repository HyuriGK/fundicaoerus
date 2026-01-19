const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// --- ROTA POST: Alternar status de exclusão (Toggle) ---
router.post('/', async (req, res) => {
    const { id, excluded } = req.body;
    const client = await pool.connect();

    try {
        await client.query(`
            UPDATE faturamento_detalhado 
            SET excluido_manualmente = $1 
            WHERE id = $2
        `, [excluded, id]);
        
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("Erro Toggle Faturamento:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;