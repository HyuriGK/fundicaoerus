import pool from '../db.js';

// Função auxiliar para limpar números (troca vírgula por ponto)
function parseNumeric(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    let cleanStr = String(value).trim().replace(/[^\d.,-]/g, ''); // Remove letras
    cleanStr = cleanStr.replace(',', '.');
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
}

export default async function handler(req, res) {
    const client = await pool.connect();

    try {
        if (req.method === 'GET') {
            const result = await client.query(`
                SELECT to_char(data_producao, 'DD/MM/YYYY') as data, 
                       setor, produto, liga, peso_un, quantidade, peso_total
                FROM producao_apontada 
                ORDER BY data_producao DESC
            `);

            // Formata para o Array de Arrays que seu HTML espera
            const formattedData = result.rows.map(row => [
                row.data,
                row.setor,
                row.produto,
                row.liga,
                Number(row.peso_un).toFixed(2).replace('.', ','), // Formata para PT-BR visualmente
                row.quantidade,
                Number(row.peso_total).toFixed(2).replace('.', ',')
            ]);

            // Adiciona cabeçalho fake
            formattedData.unshift(["Data", "Setor", "Produto", "Liga", "Peso Un", "Quant.", "Peso Total"]);

            return res.status(200).json(formattedData);
        } 
        
        else if (req.method === 'POST') {
            const data = req.body;
            
            // Se vier vazio ou só cabeçalho
            if (!data || data.length <= 0) {
                return res.status(200).json({ success: true });
            }

            await client.query('BEGIN');
            
            // O Front envia TUDO, então limpamos para reinserir (Snapshot)
            // Se quiser apenas adicionar, remova a linha do TRUNCATE, mas seu HTML sugere salvamento completo.
            await client.query('TRUNCATE TABLE producao_apontada RESTART IDENTITY');

            const insertQuery = `
                INSERT INTO producao_apontada 
                (data_producao, setor, produto, liga, peso_un, quantidade, peso_total)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `;

            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                
                // Ignora cabeçalho se for string pura
                if (row[0] === "Data" && row[1] === "Setor") continue;

                // Tratamento de Data
                let dateVal = null;
                const rawDate = row[0];
                
                if (typeof rawDate === 'number') {
                    // Excel Serial
                    dateVal = new Date((rawDate - (25567 + 2)) * 86400 * 1000).toISOString().split('T')[0];
                } else if (typeof rawDate === 'string') {
                    // DD/MM/YYYY
                    const parts = rawDate.split('/');
                    if (parts.length === 3) dateVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    else dateVal = null; // Data inválida ou vazia
                }

                if (dateVal) { // Só insere se tiver data válida
                    await client.query(insertQuery, [
                        dateVal,
                        row[1], // Setor
                        row[2], // Produto
                        row[3], // Liga
                        parseNumeric(row[4]), // Peso Un
                        parseNumeric(row[5]), // Quantidade
                        parseNumeric(row[6])  // Peso Total
                    ]);
                }
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