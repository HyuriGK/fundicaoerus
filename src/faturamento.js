const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

async function ensureAbcRatingsTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS faturamento_abc_ratings (
            client_name TEXT PRIMARY KEY,
            billing INTEGER NOT NULL DEFAULT 5,
            weight INTEGER NOT NULL DEFAULT 5,
            price INTEGER NOT NULL DEFAULT 5,
            complex INTEGER NOT NULL DEFAULT 5,
            risk INTEGER NOT NULL DEFAULT 5,
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

router.get('/abc-ratings', async (req, res) => {
    const client = await pool.connect();

    try {
        await ensureAbcRatingsTable(client);
        const result = await client.query(`
            SELECT client_name, billing, weight, price, complex, risk
            FROM faturamento_abc_ratings
        `);

        const ratings = {};
        result.rows.forEach(row => {
            ratings[row.client_name] = {
                billing: Number(row.billing),
                weight: Number(row.weight),
                price: Number(row.price),
                complex: Number(row.complex),
                risk: Number(row.risk)
            };
        });

        res.json(ratings);
    } catch (error) {
        console.error('Erro ao buscar avaliações ABC:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

router.post('/abc-ratings', async (req, res) => {
    const { client_name, billing = 5, weight = 5, price = 5, complex = 5, risk = 5 } = req.body;
    if (!client_name) return res.status(400).json({ error: 'client_name obrigatório' });

    const client = await pool.connect();

    try {
        await ensureAbcRatingsTable(client);
        await client.query(`
            INSERT INTO faturamento_abc_ratings
                (client_name, billing, weight, price, complex, risk, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (client_name) DO UPDATE SET
                billing = EXCLUDED.billing,
                weight = EXCLUDED.weight,
                price = EXCLUDED.price,
                complex = EXCLUDED.complex,
                risk = EXCLUDED.risk,
                updated_at = NOW()
        `, [client_name, billing, weight, price, complex, risk]);

        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao salvar avaliação ABC:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

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
