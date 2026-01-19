import pool from '.../lib/db.js';

export default async function handler(req, res) {
    const client = await pool.connect();
    const { action } = req.query;

    try {
        // --- GET: Carregar dados iniciais ---
        if (req.method === 'GET') {
            const dados = await client.query('SELECT id, setor, motivo, to_char(data, \'YYYY-MM-DD\') as data, cod_cliente, cliente, cod_produto, descricao, material, quantidade, peso_un, peso_total FROM refugo_dados ORDER BY data DESC');
            const producao = await client.query('SELECT * FROM refugo_producao_mensal');
            
            // Converte a lista de produção em um objeto { '2025-01': 50000 }
            const prodMap = {};
            producao.rows.forEach(r => prodMap[r.mes_ano] = parseFloat(r.peso_produzido));

            return res.status(200).json({
                refugoRawData: dados.rows,
                refugoMonthlyProduction: prodMap
            });
        }

        // --- POST: Ações de Escrita ---
        if (req.method === 'POST') {
            const data = req.body;

            // 1. Salvar Importação do Excel (Snapshot)
            if (action === 'save-all') {
                await client.query('BEGIN');
                // Limpa o banco para a nova importação
                await client.query('TRUNCATE TABLE refugo_dados RESTART IDENTITY');
                
                const query = `INSERT INTO refugo_dados (setor, motivo, data, cod_cliente, cliente, cod_produto, descricao, material, quantidade, peso_un, peso_total) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

                for (const row of data) {
                    // row[2] é a data. Precisamos validar
                    let dateVal = row[2];
                    if (typeof dateVal === 'number') {
                        dateVal = new Date((dateVal - (25567 + 2)) * 86400 * 1000).toISOString().split('T')[0];
                    }
                    
                    await client.query(query, [row[0], row[1], dateVal, row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10]]);
                }
                await client.query('COMMIT');
                return res.status(200).json({ success: true });
            }

            // 2. Salvar Produção Mensal (Meta/Base)
            if (action === 'save-prod') {
                const { mes_ano, peso_produzido } = data;
                await client.query(`
                    INSERT INTO refugo_producao_mensal (mes_ano, peso_produzido) 
                    VALUES ($1, $2) ON CONFLICT (mes_ano) DO UPDATE SET peso_produzido = $2
                `, [mes_ano, peso_produzido]);
                return res.status(200).json({ success: true });
            }

            // 3. Atualizar Peso Unitário (Edição na tabela)
            if (action === 'update-weight') {
                const { id, peso_un, peso_total } = data;
                await client.query('UPDATE refugo_dados SET peso_un = $1, peso_total = $2 WHERE id = $3', [peso_un, peso_total, id]);
                return res.status(200).json({ success: true });
            }

            // 4. Limpar Tudo
            if (action === 'clear-all') {
                await client.query('TRUNCATE TABLE refugo_dados, refugo_producao_mensal RESTART IDENTITY');
                return res.status(200).json({ success: true });
            }
        }
    } catch (error) {
        if (req.method === 'POST') await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}