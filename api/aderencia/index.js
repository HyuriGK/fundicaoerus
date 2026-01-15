import pool from '../../db.js';

export default async function handler(req, res) {
    const client = await pool.connect();
    const { action } = req.query;

    try {
        // --- GET: Buscar todos os registros ---
        if (req.method === 'GET') {
            const result = await client.query(`
                SELECT id, setor as sector, to_char(data, 'YYYY-MM-DD') as date, 
                       op, codigo_item as code, liga_corrida as heat, 
                       programado as prog, realizado as real 
                FROM aderencia_pcp 
                ORDER BY data DESC, id DESC
            `);
            return res.status(200).json(result.rows);
        }

        // --- POST: Ações de Escrita ---
        if (req.method === 'POST') {
            const data = req.body;

            // 1. Salvar novo registro
            if (action === 'save') {
                const query = `
                    INSERT INTO aderencia_pcp (setor, data, op, codigo_item, liga_corrida, programado, realizado) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
                const values = [data.sector, data.date, data.op, data.code, data.heat, data.prog, data.real];
                const result = await client.query(query, values);
                return res.status(200).json({ success: true, id: result.rows[0].id });
            }

            // 2. Atualizar apenas o Realizado (Edição em linha)
            if (action === 'update-real') {
                await client.query('UPDATE aderencia_pcp SET realizado = $1 WHERE id = $2', [data.real, data.id]);
                return res.status(200).json({ success: true });
            }

            // 3. Deletar registro
            if (action === 'delete') {
                await client.query('DELETE FROM aderencia_pcp WHERE id = $1', [data.id]);
                return res.status(200).json({ success: true });
            }
        }
    } catch (error) {
        console.error("Erro na API de Aderência:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}