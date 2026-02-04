require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('📊 Testando consulta simples...\n');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro:', err);
        return;
    }

    // Query simples sem JOIN com cliente
    const query = `
        SELECT FIRST 10
            nf.EMISSAO_NOT as DATA_FATURAMENTO,
            nf.NUMERO_NOT as PEDIDO,
            nfp.PRODUTO_NPR as CODIGO_ITEM,
            nfp.NOME_PRODUTO_NPR as DESCRICAO,
            nfp.QUANTIDADE_NPR as QUANTIDADE,
            nfp.PRECO_NPR as VALOR_UNITARIO,
            nfp.TOTAL_NPR as VALOR_TOTAL
        FROM NOTA_FISCAL nf
        LEFT JOIN NOTA_FISCAL_PRODUTO nfp 
            ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
            AND nf.SERIE_NOT = nfp.SERIE_NPR
            AND nf.CODIGO_NOT = nfp.CODIGO_NPR
        WHERE nf.EMISSAO_NOT IS NOT NULL
            AND nf.TIPO_NOT = 'S'
            AND nfp.PRODUTO_NPR IS NOT NULL
        ORDER BY nf.EMISSAO_NOT DESC
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('❌ Erro:', err);
        } else {
            console.log(`✅ ${result.length} registros encontrados!\n`);
            result.forEach(row => {
                console.log({
                    data: row.DATA_FATURAMENTO,
                    pedido: row.PEDIDO,
                    codigo: row.CODIGO_ITEM,
                    descricao: row.DESCRICAO ? row.DESCRICAO.trim().substring(0, 30) : null,
                    qtd: row.QUANTIDADE,
                    vlUnit: (row.VALOR_UNITARIO || 0) / 100,
                    vlTotal: (row.VALOR_TOTAL || 0) / 100
                });
            });
        }
        db.detach();
    });
});
