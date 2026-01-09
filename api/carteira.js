import pool from './db.js';

export default async function handler(req, res) {
  try {
    // Retorna os dados ordenados por data
    const result = await pool.query(`
      SELECT pedido, ordem_compra, to_char(entrega, 'DD/MM/YYYY') as entrega, 
             razao_social, codigo, nome_produto, material, peso_un, 
             qtd_pedido, saldo, peso_total 
      FROM carteira 
      ORDER BY entrega ASC
    `);
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}