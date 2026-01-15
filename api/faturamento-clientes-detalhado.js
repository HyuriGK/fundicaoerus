import pool from '../db.js';

// Função auxiliar para forçar conversão para número
// Evita erro se vier texto ou formato moeda (ex: "R$ 1.000,00")
function parseNumeric(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    
    let cleanStr = String(value).trim();
    
    // Se tiver letras (ex: "BS 30" caindo em campo errado), retorna 0 para não travar
    if (/[a-zA-Z]/.test(cleanStr)) return 0;

    cleanStr = cleanStr.replace(',', '.');
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
}

export default async function handler(req, res) {
    const client = await pool.connect();

    try {
        if (req.method === 'GET') {
            const result = await client.query(`
                SELECT id, to_char(data_faturamento, 'YYYY-MM-DD') as data, 
                       pedido, ordem_compra, cod_cliente, cliente, 
                       codigo, descricao, quantidade, preco_un, 
                       material, peso_un, peso_total, valor_total, excluido_manualmente
                FROM faturamento_detalhado 
                ORDER BY data_faturamento DESC
            `);

            // Mapeia do Banco para o HTML
            const formattedData = result.rows.map(row => [
                row.id,
                row.data,
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

            formattedData.unshift(["HEADER", "DATA", "PEDIDO", "OC", "COD", "CLI", "COD", "DESC", "QTD", "PRE", "MAT", "PESO", "PESOT", "VAL", "IGN"]);

            return res.status(200).json(formattedData);
        } 
        
        else if (req.method === 'POST') {
            const data = req.body; // Dados do Excel
            
            if (!data || data.length <= 1) {
                await client.query('TRUNCATE TABLE faturamento_detalhado RESTART IDENTITY');
                return res.status(200).json({ success: true, message: 'Tabela limpa' });
            }

            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE faturamento_detalhado RESTART IDENTITY');

            const insertQuery = `
                INSERT INTO faturamento_detalhado 
                (data_faturamento, pedido, ordem_compra, cod_cliente, cliente, codigo, descricao, quantidade, preco_un, material, peso_un, peso_total, valor_total, excluido_manualmente)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `;

            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                
                // Mapeamento baseado na SUA ordem (0 a 12)
                // 0: Data
                // 1: Pedido
                // 2: OC
                // 3: Cod Cli
                // 4: Cliente
                // 5: Cod Prod
                // 6: Produto
                // 7: Quantidade
                // 8: Valor Un
                // 9: Material
                // 10: Peso Un
                // 11: Peso Total
                // 12: Valor Total

                // Tratamento da Data (Coluna 0)
                let dateVal = null;
                const rawDate = row[0]; // Agora pega a primeira coluna corretamente
                
                if (typeof rawDate === 'number') {
                    // Excel Serial Date
                    dateVal = new Date((rawDate - (25567 + 2)) * 86400 * 1000).toISOString().split('T')[0];
                } else if (typeof rawDate === 'string') {
                    // String DD/MM/YYYY
                    const parts = rawDate.split('/');
                    if (parts.length === 3) dateVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    else dateVal = rawDate; // Tenta ISO direto se falhar
                }

                await client.query(insertQuery, [
                    dateVal,                // $1  - Data (Excel Col 0)
                    row[1],                 // $2  - Pedido (Excel Col 1)
                    row[2],                 // $3  - OC (Excel Col 2)
                    row[3],                 // $4  - Cod Cli (Excel Col 3)
                    row[4],                 // $5  - Cliente (Excel Col 4)
                    row[5],                 // $6  - Cod Produto (Excel Col 5)
                    row[6],                 // $7  - Descrição Produto (Excel Col 6)
                    parseNumeric(row[7]),   // $8  - Quantidade (Excel Col 7)
                    parseNumeric(row[8]),   // $9  - Valor Un (Excel Col 8)
                    row[9],                 // $10 - Material (Excel Col 9 - TEXTO)
                    parseNumeric(row[10]),  // $11 - Peso Un (Excel Col 10)
                    parseNumeric(row[11]),  // $12 - Peso Total (Excel Col 11)
                    parseNumeric(row[12]),  // $13 - Valor Total (Excel Col 12)
                    false                   // $14 - Excluido
                ]);
            }

            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("ERRO NO IMPORT:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}