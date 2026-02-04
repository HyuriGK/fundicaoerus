const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const pool = require('../lib/db');

async function compare() {
    try {
        console.log('🔌 Conectando ao Postgres...');

        // 1. Get Firebird Data (Pedidos.html)
        const resFirebird = await pool.query(`
            SELECT 
                data->>'PEDIDO_PPR' as id, 
                data->>'CODIGO_PPR' as codigo,
                data->>'PRODUTO_PPR' as prod, 
                data->>'NOME_PRODUTO_PPR' as name,
                data->>'QUANTIDADE_PPR' as qtd,
                data->>'ENTREGA_PETR' as entrega
            FROM firebird_sync_pedidos
        `);

        // 2. Get Carteira Data (Carteira.html)
        const resCarteira = await pool.query(`
            SELECT pedido as id, codigo, nome_produto 
            FROM carteira
        `);

        console.log(`\n🐛 DEBUG IDs:`);
        console.log(`Firebird Sample: ${resFirebird.rows[0]?.id}`);
        console.log(`Carteira Sample: ${resCarteira.rows[0]?.id}`);

        const fbParams = resFirebird.rows.map(r => ({
            id: String(r.id || '').trim(),
            codigo: String(r.codigo || '').trim(),
            key: `${String(r.id || '').trim()}_${String(r.codigo || '').trim()}`,
            raw: r
        }));

        const cartParams = resCarteira.rows.map(r => ({
            id: String(r.id || '').trim(),
            codigo: String(r.codigo || '').trim(),
            key: `${String(r.id || '').trim()}_${String(r.codigo || '').trim()}`,
            raw: r
        }));

        // Filter Models
        const isModel = (id, code, name) => {
            return String(code).trim().endsWith('1') && String(name).trim().toUpperCase().startsWith('MODELO');
        };

        const fbParamsFiltered = fbParams.filter(i => !isModel(i.id, i.codigo, i.raw.name || i.raw.prod));
        const cartParamsFiltered = cartParams.filter(i => !isModel(i.id, i.codigo, i.raw.nome_produto));

        const fbKeys = new Set(fbParamsFiltered.map(i => i.key));
        const cartKeys = new Set(cartParamsFiltered.map(i => i.key));

        console.log(`\n📊 Firebird (Sem Modelos): ${fbParamsFiltered.length} linhas.`);
        console.log(`📊 Carteira (Sem Modelos): ${cartParamsFiltered.length} linhas.`);

        // 3. Find missing in Carteira (Extra in Firebird)
        const extraInFb = fbParamsFiltered.filter(i => !cartKeys.has(i.key));

        // 4. Find missing in Firebird (Extra in Carteira)
        const extraInCart = cartParamsFiltered.filter(i => !fbKeys.has(i.key));

        console.log(`\n🚨 Existem ${extraInFb.length} pedidos no 'Pedidos.html' (Sem Modelos) que NÃO estão no 'Carteira.html':`);
        if (extraInFb.length > 0) {
            console.table(extraInFb.map(i => ({
                PEDIDO: i.id,
                COD: i.codigo,
                PRODUTO: i.raw.name || i.raw.prod
            })));
        } else {
            console.log("Nenhum.");
        }

        console.log(`\n🚨 Existem ${extraInCart.length} pedidos no 'Carteira.html' (Sem Modelos) que NÃO estão no 'Pedidos.html':`);
        if (extraInCart.length > 0) {
            console.table(extraInCart.map(i => ({
                PEDIDO: i.id,
                COD: i.codigo,
                PRODUTO: i.raw.nome_produto
            })));
        } else {
            console.log("Nenhum.");
        }

        // 5. Analyze "MODELO" items
        console.log(`\n🔍 Análise de itens 'MODELO' (FIREBIRD / PEDIDOS.HTML):`);
        const modelosFb = fbParams.filter(i => {
            const name = (i.raw.name || i.raw.prod || '').toUpperCase();
            return name.startsWith('MODELO');
        });
        console.log(`Found ${modelosFb.length} items starting with 'MODELO' in Firebird.`);

        console.log(`\n🔍 Análise de itens 'MODELO' (CARTEIRA / CARTEIRA.HTML):`);
        const modelosCart = cartParams.filter(i => {
            const name = (i.raw.nome_produto || i.raw.codigo || '').toUpperCase();
            return name.startsWith('MODELO');
        });
        console.log(`Found ${modelosCart.length} items starting with 'MODELO' in Carteira.`);

        console.table(modelosCart.map(i => ({
            PEDIDO: i.id,
            COD: i.raw.codigo,
            PRODUTO: i.raw.nome_produto
        })));
    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
}

compare();
