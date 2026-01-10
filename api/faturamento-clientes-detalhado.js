import pool from './db.js';

export default async function handler(req, res) {
    const client = await pool.connect();

    try {
        if (req.method === 'GET') {
            // Busca dados ordenados por data
            const result = await client.query(`
                SELECT id, to_char(data_faturamento, 'YYYY-MM-DD') as data, 
                       pedido, ordem_compra, cod_cliente, cliente, 
                       codigo, descricao, quantidade, preco_un, 
                       material, peso_un, peso_total, valor_total, excluido_manualmente
                FROM faturamento_detalhado 
                ORDER BY data_faturamento DESC
            `);

            // Transforma o objeto do banco no Array de Arrays que o HTML usa
            // Estrutura: [id, data, ped, oc, codcli, cli, cod, desc, qtd, pre, mat, pesoU, pesoT, valT, excluido]
            const formattedData = result.rows.map(row => [
                row.id,
                row.data, // DATA
                row.pedido,
                row.ordem_compra,
                row.cod_cliente,
                row.cliente,
                row.codigo,
                row.descricao,
                Number(row.quantidade),
                Number(row.preco_un),
                row.material,
                Number(row.peso_un),
                Number(row.peso_total),
                Number(row.valor_total),
                row.excluido_manualmente ? 1 : 0
            ]);

            // Adiciona o cabeçalho fake (o HTML ignora a linha 0, mas precisa dela)
            formattedData.unshift(["HEADER", "DATA", "PEDIDO", "OC", "COD", "CLI", "COD", "DESC", "QTD", "PRE", "MAT", "PESO", "PESOT", "VAL", "IGN"]);

            return res.status(200).json(formattedData);
        } 
        
        else if (req.method === 'POST') {
            const data = req.body; // O HTML manda um Array de Arrays
            
            // Se vier apenas o cabeçalho ou vazio, é uma ação de "Limpar Dados"
            if (!data || data.length <= 1) {
                await client.query('TRUNCATE TABLE faturamento_detalhado RESTART IDENTITY');
                return res.status(200).json({ success: true, message: 'Tabela limpa' });
            }

            await client.query('BEGIN');
            
            // Limpa dados anteriores para substituir pelo novo Excel
            await client.query('TRUNCATE TABLE faturamento_detalhado RESTART IDENTITY');

            const insertQuery = `
                INSERT INTO faturamento_detalhado 
                (data_faturamento, pedido, ordem_compra, cod_cliente, cliente, codigo, descricao, quantidade, preco_un, material, peso_un, peso_total, valor_total, excluido_manualmente)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `;

            // Pula a linha 0 (cabeçalho) e insere o resto
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                
                // Tratamento de Data (Excel manda serial number ou string)
                let dateVal = null;
                if (typeof row[1] === 'number') {
                    // Converter serial do Excel para data JS
                    dateVal = new Date((row[1] - (25567 + 2)) * 86400 * 1000).toISOString().split('T')[0];
                } else if (typeof row[1] === 'string') {
                    // Tenta converter DD/MM/YYYY para YYYY-MM-DD
                    const parts = row[1].split('/');
                    if (parts.length === 3) dateVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    else dateVal = row[1]; // Tenta salvar como veio
                }

                await client.query(insertQuery, [
                    dateVal,            // Data
                    row[2],             // Pedido
                    row[3],             // OC
                    row[4],             // Cod Cli
                    row[5],             // Cliente
                    row[6],             // Codigo
                    row[7],             // Descricao
                    row[8] || 0,        // Quant
                    row[9] || 0,        // Preco Un
                    row[10],            // Material
                    row[11] || 0,       // Peso Un
                    row[12] || 0,       // Peso Total
                    row[13] || 0,       // Valor Total
                    false               // Excluido (Padrão False ao importar)
                ]);
            }

            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}