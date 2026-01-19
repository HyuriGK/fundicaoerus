import pool from '../../lib/db.js'; // Note os dois pontos (..) para voltar uma pasta

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    const { id, excluded } = req.body;

    try {
        await pool.query(`
            UPDATE faturamento_detalhado 
            SET excluido_manualmente = $1 
            WHERE id = $2
        `, [excluded, id]);
        
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}