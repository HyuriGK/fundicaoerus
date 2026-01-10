import pool from './db.js';

// Função auxiliar para forçar conversão para número
// Se receber "BS 30", "R$ 10,00" ou texto, converte para número ou 0
function parseNumeric(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    
    // Converte para string, remove tudo que não for número, ponto ou vírgula
    // Ex: "R$ 1.200,50" vira "1200.50"
    let cleanStr = String(value).trim();
    
    // Se a string contiver letras (como "BS 30"), retorna 0 para evitar erro no banco
    if (/[a-zA-Z]/.test(cleanStr)) return 0;

    // Troca vírgula por ponto para o padrão americano/banco
    cleanStr = cleanStr.replace(',', '.');
    
    // Tenta converter
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
            const data = req.body;
            
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
                
                // Tratamento de Data
                let dateVal = null;
                if (typeof row[1] === 'number') {
                    dateVal = new Date((row[1] - (25567 + 2)) * 86400 * 1000).toISOString().split('T')[0];
                } else if (typeof row[1] === 'string') {
                    const parts = row[1].split('/');
                    if (parts.length === 3) dateVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    else dateVal = row[1];
                }

                // AQUI ESTA A CORREÇÃO: Usamos parseNumeric() em todos os campos numéricos
                // Se row[11] for "BS 30", a função devolve 0 e o banco aceita.
                await client.query(insertQuery, [
                    dateVal,                // $1  - Data
                    row[2],                 // $2  - Pedido
                    row[3],                 // $3  - OC
                    row[4],                 // $4  - Cod Cli
                    row[5],                 // $5  - Cliente
                    row[6],                 // $6  - Codigo
                    row[7],                 // $7  - Descricao
                    parseNumeric(row[8]),   // $8  - Quantidade
                    parseNumeric(row[9]),   // $9  - Preco Un
                    row[10],                // $10 - Material (Esse é TEXTO, aceita "BS 30")
                    parseNumeric(row[11]),  // $11 - Peso Un
                    parseNumeric(row[12]),  // $12 - Peso Total
                    parseNumeric(row[13]),  // $13 - Valor Total
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