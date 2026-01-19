import pool from '../../lib/db.js';

export default async function handler(req, res) {
    const client = await pool.connect();

    try {
        if (req.method === 'GET') {
            const { mes_ano } = req.query; // Espera formato 'YYYY-MM'
            const result = await client.query('SELECT meta_peso FROM metas_faturamento WHERE mes_ano = $1', [mes_ano]);
            
            if (result.rows.length > 0) {
                res.status(200).json(result.rows[0]);
            } else {
                res.status(200).json({ meta_peso: 0 });
            }
        } 
        else if (req.method === 'POST') {
            const { mes_ano, meta_peso } = req.body;
            
            await client.query(`
                INSERT INTO metas_faturamento (mes_ano, meta_peso)
                VALUES ($1, $2)
                ON CONFLICT (mes_ano) 
                DO UPDATE SET meta_peso = $2
            `, [mes_ano, meta_peso]);

            res.status(200).json({ success: true });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}