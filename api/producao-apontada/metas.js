import pool from '../db.js'; // Ajuste o caminho '../db.js' conforme onde você salvar o arquivo

export default async function handler(req, res) {
    const client = await pool.connect();

    try {
        if (req.method === 'GET') {
            const result = await client.query('SELECT setor, meta_peso FROM metas_producao');
            res.status(200).json(result.rows);
        } 
        else if (req.method === 'POST') {
            const { setor, meta_peso } = req.body;
            
            // Converte string "10.000,00" para numero
            let cleanMeta = String(meta_peso).replace(/[^\d.,]/g, '').replace(',', '.');
            if (!cleanMeta) cleanMeta = 0;

            await client.query(`
                INSERT INTO metas_producao (setor, meta_peso)
                VALUES ($1, $2)
                ON CONFLICT (setor) 
                DO UPDATE SET meta_peso = $2
            `, [setor, cleanMeta]);

            res.status(200).json({ success: true });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}