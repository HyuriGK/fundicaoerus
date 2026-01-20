// src/custos.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// --- LEITURA (GET) ---
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        // Busca os dados formatados para DD/MM/YYYY para facilitar o frontend existente
        const query = `
            SELECT 
                to_char(data, 'DD/MM/YYYY') as data_formatada,
                categoria, 
                descricao, 
                centro_custo, 
                valor 
            FROM custos 
            ORDER BY data DESC
        `;
        const result = await client.query(query);
        
        // Retorna os dados
        res.status(200).json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// --- CRIAÇÃO (POST) ---
// Espera receber um array de arrays: [[data, categoria, desc, centro, valor], ...]
router.post('/', async (req, res) => {
    const novosDados = req.body; // O array enviado pelo front
    
    if (!Array.isArray(novosDados) || novosDados.length === 0) {
        return res.status(400).json({ error: "Nenhum dado enviado." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const queryText = `
            INSERT INTO custos (data, categoria, descricao, centro_custo, valor)
            VALUES ($1, $2, $3, $4, $5)
        `;

        for (const row of novosDados) {
            // row = [dataString, categoria, descricao, centro, valor]
            // Precisamos converter 'DD/MM/YYYY' para 'YYYY-MM-DD' para o banco aceitar
            const dataParts = row[0].split('/'); // Ex: 02/01/2026 -> [02, 01, 2026]
            
            // Validação simples de data
            let dataBanco = null;
            if (dataParts.length === 3) {
                dataBanco = `${dataParts[2]}-${dataParts[1]}-${dataParts[0]}`;
            } else {
                continue; // Pula linha se data inválida
            }

            const categoria = row[1];
            const descricao = row[2];
            const centro = row[3];
            const valor = parseFloat(row[4]);

            await client.query(queryText, [dataBanco, categoria, descricao, centro, valor]);
        }

        await client.query('COMMIT');
        res.status(200).json({ success: true, message: "Custos importados com sucesso." });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// --- LIMPEZA (DELETE) ---
router.delete('/', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('TRUNCATE TABLE custos RESTART IDENTITY');
        res.status(200).json({ success: true, message: "Banco de custos limpo." });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

module.exports = router;