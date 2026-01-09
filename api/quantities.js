import pool from './db.js';

export default async function handler(req, res) {
  try {
    const result = await pool.query('SELECT unique_key, quantidade FROM quantidades_manuais');
    const map = {};
    result.rows.forEach(r => map[r.unique_key] = parseFloat(r.quantidade));
    res.status(200).json(map);
  } catch (error) {
    res.status(500).json({});
  }
}