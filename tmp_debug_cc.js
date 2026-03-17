const pool = require('./lib/db');

async function debugCC() {
    try {
        console.log('--- mapeamentos ---');
        const { rows: mappings } = await pool.query('SELECT fornecedor, produto, centro_custo FROM centro_custos_mapeamento LIMIT 10');
        console.table(mappings);

        console.log('\n--- registros (amostra fornecedores) ---');
        const { rows: registros } = await pool.query(`
            SELECT nome as fornecedor, produto, SUM(valor) as total
            FROM custos_registros
            WHERE categoria = 'fornecedores'
            GROUP BY nome, produto
            ORDER BY total DESC
            LIMIT 20
        `);
        console.table(registros);

        const mapCC = {};
        mappings.forEach(m => { 
            const key = `${m.fornecedor}|${m.produto || ''}`;
            mapCC[key] = m.centro_custo; 
        });

        console.log('\n--- Verificando Batimento ---');
        registros.forEach(r => {
            const key = `${r.fornecedor}|${r.produto || ''}`;
            const cc = mapCC[key] || 'SEM';
            console.log(`Key: [${key}] -> CC: ${cc} (Val: ${r.total})`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

debugCC();
