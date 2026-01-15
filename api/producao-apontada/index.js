import pool from '../../db.js';

function parseNumeric(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    let cleanStr = String(value).trim().replace(/[^\d.,-]/g, '');
    cleanStr = cleanStr.replace(',', '.');
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
}

export default async function handler(req, res) {
    const client = await pool.connect();
    const { action } = req.query; // Vamos usar isso para saber o que o HTML quer

    try {
        // --- LÓGICA DE METAS ---
        if (action === 'metas') {
            if (req.method === 'GET') {
                const result = await client.query('SELECT setor, meta_peso FROM metas_producao');
                return res.status(200).json(result.rows);
            } 
            if (req.method === 'POST') {
                const { setor, meta_peso } = req.body;
                let cleanMeta = String(meta_peso).replace(/[^\d.,]/g, '').replace(',', '.');
                await client.query('INSERT INTO metas_producao (setor, meta_peso) VALUES ($1, $2) ON CONFLICT (setor) DO UPDATE SET meta_peso = $2', [setor, cleanMeta || 0]);
                return res.status(200).json({ success: true });
            }
        }

        // --- LÓGICA DE LIMPEZA ---
        if (action === 'clear' && req.method === 'POST') {
            await client.query('TRUNCATE TABLE producao_apontada RESTART IDENTITY');
            return res.status(200).json({ success: true });
        }

        // --- LÓGICA PADRÃO (LER PRODUÇÃO) ---
if (req.method === 'GET') {
    const result = await client.query("SELECT to_char(data_producao, 'DD/MM/YYYY') as data, setor, produto, liga, peso_un, quantidade, peso_total FROM producao_apontada ORDER BY data_producao DESC");
    
    const formattedData = result.rows.map(row => [
        row.data,
        row.setor,
        row.produto,
        row.liga,
        row.peso_un,    // ENVIAR O NÚMERO PURO
        row.quantidade, // ENVIAR O NÚMERO PURO
        row.peso_total  // ENVIAR O NÚMERO PURO
    ]);

    formattedData.unshift(["Data", "Setor", "Produto", "Liga", "Peso Un", "Quant.", "Peso Total"]);
    return res.status(200).json(formattedData);
}

        if (req.method === 'POST') {
            const data = req.body;
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE producao_apontada RESTART IDENTITY');
            const insertQuery = `INSERT INTO producao_apontada (data_producao, setor, produto, liga, peso_un, quantidade, peso_total) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
            for (const row of data) {
                if (row[0] === "Data") continue;
                let dateVal = null;
                if (typeof row[0] === 'number') dateVal = new Date((row[0] - (25567 + 2)) * 86400 * 1000).toISOString().split('T')[0];
                else {
                    const parts = String(row[0]).split('/');
                    if (parts.length === 3) dateVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
                if (dateVal) await client.query(insertQuery, [dateVal, row[1], row[2], row[3], parseNumeric(row[4]), parseNumeric(row[5]), parseNumeric(row[6])]);
            }
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

    } catch (error) {
        if (req.method === 'POST') await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}