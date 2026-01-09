import pool from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { unique_key, quantity } = req.body;

  try {
    await pool.query(`
      INSERT INTO quantidades_manuais (unique_key, quantidade) VALUES ($1, $2)
      ON CONFLICT (unique_key) DO UPDATE SET quantidade = $2
    `, [unique_key, quantity]);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}