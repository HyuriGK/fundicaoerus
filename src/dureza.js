const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// --- ROTA GET: Buscar todos os registros ---
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT id, to_char(data, \'YYYY-MM-DD\') as data, op, cliente, codigo, material, descricao, dureza FROM controle_dureza ORDER BY data DESC, id DESC');
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error("Erro GET Dureza:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// --- ROTA POST: Registrar e Limpar ---
router.post('/', async (req, res) => {
    const { action } = req.query;
    const data = req.body;
    const client = await pool.connect();

    try {
        // 1. Registrar nova dureza
        if (action === 'registrar') {
            const query = `INSERT INTO controle_dureza (data, op, cliente, codigo, material, descricao, dureza) 
                           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
            const values = [data.data, data.op, data.cliente, data.codigo, data.material, data.descricao, data.dureza];
            const result = await client.query(query, values);
            return res.status(200).json({ success: true, id: result.rows[0].id });
        }

        // 2. Limpar todo o banco
        if (action === 'limpar') {
            await client.query('TRUNCATE TABLE controle_dureza RESTART IDENTITY');
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Action não reconhecida' });

    } catch (error) {
        console.error("Erro POST Dureza:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// --- ROTA DELETE: Excluir um registro específico ---
router.delete('/', async (req, res) => {
    const { id } = req.body;
    const client = await pool.connect();
    
    try {
        await client.query('DELETE FROM controle_dureza WHERE id = $1', [id]);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Erro DELETE Dureza:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;