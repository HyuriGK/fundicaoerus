import pool from '.../lib/db.js';

export default async function handler(req, res) {
    const client = await pool.connect();
    const { action } = req.query;

    try {
        // --- GET: Buscar todos os registros ---
        if (req.method === 'GET') {
            const result = await client.query('SELECT id, to_char(data, \'YYYY-MM-DD\') as data, op, cliente, codigo, material, descricao, dureza FROM controle_dureza ORDER BY data DESC, id DESC');
            return res.status(200).json(result.rows);
        }

        // --- POST: Ações de Escrita ---
        if (req.method === 'POST') {
            const data = req.body;

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
        }

        // --- DELETE: Excluir um registro específico ---
        if (req.method === 'DELETE') {
            const { id } = req.body;
            await client.query('DELETE FROM controle_dureza WHERE id = $1', [id]);
            return res.status(200).json({ success: true });
        }

    } catch (error) {
        console.error("Erro na API de Dureza:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}