const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Função auxiliar para limpeza de números
function parseNumeric(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    let cleanStr = String(value).trim().replace(/[^\d.,-]/g, '');
    cleanStr = cleanStr.replace(',', '.');
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
}

// --- ROTA GET: Ler dados (Metas, Produção ou PESOS MESTRE) ---
router.get('/', async (req, res) => { // O "async" aqui é obrigatório!
    const { action } = req.query;
    const client = await pool.connect();

    try {
        // 1. Ler Pesos Mestre (Usado pelo Dashboard e pela Produção)
        if (action === 'pesos') {
            // Cria a tabela caso ela não exista (evita erro de primeira execução)
            await client.query('CREATE TABLE IF NOT EXISTS pesos_produtos (produto TEXT PRIMARY KEY, peso_un NUMERIC(10,3))');
            
            const result = await client.query('SELECT produto, peso_un FROM pesos_produtos');
            const pesosMap = {};
            result.rows.forEach(r => { 
                pesosMap[r.produto] = r.peso_un; 
            });
            return res.status(200).json(pesosMap);
        }

        // 2. Ler Metas
        if (action === 'metas') {
            const result = await client.query('SELECT setor, meta_peso FROM metas_producao');
            return res.status(200).json(result.rows);
        }

        // 3. Ler Produção Apontada (Padrão)
        const result = await client.query("SELECT to_char(data_producao, 'DD/MM/YYYY') as data, setor, produto, liga, peso_un, quantidade, peso_total FROM producao_apontada ORDER BY data_producao DESC");
        
        const formattedData = result.rows.map(row => [
            row.data, row.setor, row.produto, row.liga, row.peso_un, row.quantidade, row.peso_total
        ]);

        formattedData.unshift(["Data", "Setor", "Produto", "Liga", "Peso Un", "Quant.", "Peso Total"]);
        return res.status(200).json(formattedData);

    } catch (error) {
        console.error("Erro GET Produção Apontada:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// --- ROTA POST: Gravar dados (Metas, Limpar ou PESOS MESTRE) ---
router.post('/', async (req, res) => { // O "async" aqui é obrigatório!
    const { action } = req.query;
    const client = await pool.connect();

    try {
        // 1. Salvar Pesos Mestre (Vindo do botão "Salvar Pesos")
        if (action === 'pesos') {
            const { pesos } = req.body; 
            await client.query('CREATE TABLE IF NOT EXISTS pesos_produtos (produto TEXT PRIMARY KEY, peso_un NUMERIC(10,3))');
            
            await client.query('BEGIN');
            for (const [prod, peso] of Object.entries(pesos)) {
                await client.query(
                    'INSERT INTO pesos_produtos (produto, peso_un) VALUES ($1, $2) ON CONFLICT (produto) DO UPDATE SET peso_un = $2',
                    [prod, peso]
                );
            }
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        // 2. Salvar Metas
        if (action === 'metas') {
            const { setor, meta_peso } = req.body;
            let cleanMeta = String(meta_peso).replace(/[^\d.,]/g, '').replace(',', '.');
            await client.query(
                'INSERT INTO metas_producao (setor, meta_peso) VALUES ($1, $2) ON CONFLICT (setor) DO UPDATE SET meta_peso = $2', 
                [setor, cleanMeta || 0]
            );
            return res.status(200).json({ success: true });
        }

        // 3. Limpar Tabela
        if (action === 'clear') {
            await client.query('TRUNCATE TABLE producao_apontada RESTART IDENTITY');
            return res.status(200).json({ success: true });
        }

        // 4. Importar Produção (Excel) - PADRÃO
        const data = req.body;
        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE producao_apontada RESTART IDENTITY');
        
        const insertQuery = `INSERT INTO producao_apontada (data_producao, setor, produto, liga, peso_un, quantidade, peso_total) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
        
        for (const row of data) {
            if (row[0] === "Data") continue;
            let dateVal = null;
            if (typeof row[0] === 'number') {
                dateVal = new Date((row[0] - (25567 + 2)) * 86400 * 1000).toISOString().split('T')[0];
            } else {
                const parts = String(row[0]).split('/');
                if (parts.length === 3) dateVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            if (dateVal) {
                await client.query(insertQuery, [
                    dateVal, row[1], row[2], row[3], 
                    parseNumeric(row[4]), parseNumeric(row[5]), parseNumeric(row[6])
                ]);
            }
        }
        await client.query('COMMIT');
        return res.status(200).json({ success: true });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erro POST Produção Apontada:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;