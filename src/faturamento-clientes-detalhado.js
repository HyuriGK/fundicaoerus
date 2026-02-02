const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

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

// --- ROTA GET: Ler dados ---
router.get('/', async (req, res) => {
    const client = await pool.connect();

    try {
        const result = await client.query(`
            SELECT id, to_char(data_faturamento, 'YYYY-MM-DD') as data, 
                   pedido, ordem_compra, cod_cliente, cliente, 
                   codigo, descricao, quantidade, preco_un, 
                   material, peso_un, peso_total, valor_total, excluido_manualmente
            FROM faturamento_detalhado 
            ORDER BY data_faturamento DESC
        `);

        // Mapeia do Banco para o HTML (Formato Array de Arrays)
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
            row.excluido_manualmente ? 1 : 0  // MODIFICAÇÃO: Mantido como 1 para excluído, 0 para incluído
        ]);

        // Adiciona o cabeçalho fake para compatibilidade com o frontend antigo
        formattedData.unshift(["HEADER", "DATA", "PEDIDO", "OC", "COD", "CLI", "COD", "DESC", "QTD", "PRE", "MAT", "PESO", "PESOT", "VAL", "IGN"]);

        return res.status(200).json(formattedData);

    } catch (error) {
        console.error("ERRO GET Faturamento Detalhado:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});


// --- INICIALIZAÇÃO DA TABELA DE PREFERÊNCIAS ---
(async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS faturamento_preferencias (
                chave_unica TEXT PRIMARY KEY, 
                excluido BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Tabela 'faturamento_preferencias' verificada.");
    } catch (e) {
        console.error("❌ Erro ao criar tabela faturamento_preferencias:", e);
    } finally {
        client.release();
    }
})();

// Helper para gerar chave única consistente
function generateKey(dateStr, pedido, codigo, quant) {
    if (!pedido && !codigo) return null;
    
    // Normaliza Data para YYYY-MM-DD
    let cleanDate = dateStr;
    if (dateStr && dateStr.includes('T')) cleanDate = dateStr.split('T')[0];
    
    const p = String(pedido || '').trim();
    const c = String(codigo || '').trim();
    const q = String(quant || '').trim();
    
    return `${cleanDate}_${p}_${c}_${q}`;
}

// --- ROTA POST: Toggle Preferência (Chamada pelo Frontend ao clicar no checkbox) ---
router.post('/toggle-preference', async (req, res) => {
    const { key, excluded } = req.body;
    
    if (!key) return res.status(400).json({ error: "Chave inválida" });

    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO faturamento_preferencias (chave_unica, excluido)
            VALUES ($1, $2)
            ON CONFLICT (chave_unica) 
            DO UPDATE SET excluido = EXCLUDED.excluido, updated_at = CURRENT_TIMESTAMP
        `, [key, excluded]);
        
        // Opcional: Atualiza também a tabela atual se o registro existir lá (para consistência imediata)
        // Isso é complexo pois precisaríamos reconstruir a chave no SQL ou fazer match. 
        // Como o Frontend já atualiza visualmente, focamos na persistência futura.
        
        return res.json({ success: true });
    } catch (error) {
        console.error("Erro ao salvar preferência:", error);
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// --- ROTA POST: Importar Excel ---
router.post('/', async (req, res) => {
    const data = req.body; // Dados do Excel (Array de Arrays)
    const client = await pool.connect();

    try {
        // Se vier vazio ou só cabeçalho, limpa a tabela
        if (!data || data.length <= 1) {
            await client.query('TRUNCATE TABLE faturamento_detalhado RESTART IDENTITY');
            return res.status(200).json({ success: true, message: 'Tabela limpa' });
        }
        
        // 1. Carregar TODAS as preferências salvas
        const prefsResult = await client.query('SELECT chave_unica, excluido FROM faturamento_preferencias');
        const prefsMap = new Map();
        prefsResult.rows.forEach(r => prefsMap.set(r.chave_unica, r.excluido));

        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE faturamento_detalhado RESTART IDENTITY');

        const insertQuery = `
            INSERT INTO faturamento_detalhado 
            (data_faturamento, pedido, ordem_compra, cod_cliente, cliente, codigo, descricao, quantidade, preco_un, material, peso_un, peso_total, valor_total, excluido_manualmente)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `;

        // Começa do 1 para pular o cabeçalho
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            
            // Tratamento da Data (Coluna 0)
            let dateVal = null;
            const rawDate = row[0]; 
            
            if (typeof rawDate === 'number') {
                // Excel Serial Date
                dateVal = new Date((rawDate - (25567 + 2)) * 86400 * 1000).toISOString().split('T')[0];
            } else if (typeof rawDate === 'string') {
                // String DD/MM/YYYY
                const parts = rawDate.split('/');
                if (parts.length === 3) dateVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
                else dateVal = rawDate; // Tenta ISO direto se falhar
            }
            
            // 2. Gerar Chave e Verificar Preferência
            const pedido = row[1];
            const codigo = row[5];
            const quant = parseNumeric(row[7]);
            
            const key = generateKey(dateVal, pedido, codigo, quant);
            
            // Se existir preferência salva, usa ela. Se não, false (INCLUÍDO padrão)
            const isExcluded = prefsMap.has(key) ? prefsMap.get(key) : false;

            await client.query(insertQuery, [
                dateVal,                // $1  - Data (Excel Col 0)
                row[1],                 // $2  - Pedido (Excel Col 1)
                row[2],                 // $3  - OC (Excel Col 2)
                row[3],                 // $4  - Cod Cli (Excel Col 3)
                row[4],                 // $5  - Cliente (Excel Col 4)
                row[5],                 // $6  - Cod Produto (Excel Col 5)
                row[6],                 // $7  - Descrição Produto (Excel Col 6)
                quant,                  // $8  - Quantidade (Excel Col 7)
                parseNumeric(row[8]),   // $9  - Valor Un (Excel Col 8)
                row[9],                 // $10 - Material (Excel Col 9 - TEXTO)
                parseNumeric(row[10]),  // $11 - Peso Un (Excel Col 10)
                parseNumeric(row[11]),  // $12 - Peso Total (Excel Col 11)
                parseNumeric(row[12]),  // $13 - Valor Total (Excel Col 12)
                isExcluded              // $14 - Usa preferência salva!
            ]);
        }

        await client.query('COMMIT');
        return res.status(200).json({ success: true });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("ERRO POST Faturamento Detalhado:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;