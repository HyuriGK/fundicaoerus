const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// --- ROTA GET: Buscar meta de um mês específico ---
router.get('/', async (req, res) => {
    const { mes_ano } = req.query; // Espera formato 'YYYY-MM'
    const client = await pool.connect();

    try {
        const result = await client.query('SELECT meta_peso FROM metas_faturamento WHERE mes_ano = $1', [mes_ano]);
        
        if (result.rows.length > 0) {
            return res.status(200).json(result.rows[0]);
        } else {
            return res.status(200).json({ meta_peso: 0 });
        }

    } catch (error) {
        console.error("Erro GET Metas:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// --- ROTA POST: Salvar ou Atualizar meta (Upsert) ---
router.post('/', async (req, res) => {
    const { mes_ano, meta_peso } = req.body;
    const client = await pool.connect();

    try {
        await client.query(`
            INSERT INTO metas_faturamento (mes_ano, meta_peso)
            VALUES ($1, $2)
            ON CONFLICT (mes_ano) 
            DO UPDATE SET meta_peso = $2
        `, [mes_ano, meta_peso]);

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("Erro POST Metas:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;