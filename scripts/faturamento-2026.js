require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('📊 Consultando faturamento de 2026...\n');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro:', err);
        return;
    }

    // Query otimizada - apenas 2026, sem cliente por enquanto
    const query = `
        SELECT FIRST 100
            nf.EMISSAO_NOT as DATA_FATURAMENTO,
            nf.NUMERO_NOT as NOTA_FISCAL,
            nf.DESTINATARIO_NOT as CLIENTE_CODIGO,
            nfp.PRODUTO_NPR as CODIGO_ITEM,
            nfp.NOME_PRODUTO_NPR as DESCRICAO,
            nfp.QUANTIDADE_NPR as QUANTIDADE,
            nfp.PRECO_NPR as VALOR_UNITARIO,
            nfp.TOTAL_NPR as VALOR_TOTAL,
            nf.SERIE_NOT as SERIE
        FROM NOTA_FISCAL nf
        INNER JOIN NOTA_FISCAL_PRODUTO nfp 
            ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
            AND nf.SERIE_NOT = nfp.SERIE_NPR
            AND nf.CODIGO_NOT = nfp.CODIGO_NPR
        WHERE nf.EMISSAO_NOT >= '2026-01-01'
            AND nf.EMISSAO_NOT < '2027-01-01'
            AND nf.TIPO_NOT = 'S'
            AND nfp.PRODUTO_NPR IS NOT NULL
        ORDER BY nf.EMISSAO_NOT DESC, nf.NUMERO_NOT DESC
    `;

    console.log('🔍 Executando consulta...\n');

    db.query(query, function (err, result) {
        if (err) {
            console.error('❌ Erro ao consultar:', err.message);
            db.detach();
            return;
        }

        console.log(`✅ ${result.length} registros encontrados!\n`);
        console.log('='.repeat(120));
        console.log('DATA       | NF     | CLI  | CÓD.ITEM | DESCRIÇÃO                    | QTD      | VL.UNIT  | VL.TOTAL');
        console.log('='.repeat(120));

        result.forEach(row => {
            const data = row.DATA_FATURAMENTO ? row.DATA_FATURAMENTO.toISOString().split('T')[0] : 'N/A';
            const nf = (row.NOTA_FISCAL || '').toString().padStart(6);
            const cli = (row.CLIENTE_CODIGO || '').toString().padStart(4);
            const codItem = (row.CODIGO_ITEM || '').toString().padStart(8);
            const descricao = (row.DESCRICAO || '').trim().substring(0, 28).padEnd(28);
            const qtd = (row.QUANTIDADE || 0).toString().padStart(8);
            const vlUnit = ((row.VALOR_UNITARIO || 0) / 100).toFixed(2).padStart(8);
            const vlTotal = ((row.VALOR_TOTAL || 0) / 100).toFixed(2).padStart(8);

            console.log(`${data} | ${nf} | ${cli} | ${codItem} | ${descricao} | ${qtd} | ${vlUnit} | ${vlTotal}`);
        });

        console.log('='.repeat(120));

        // Calcular total faturado
        const totalFaturado = result.reduce((sum, row) => sum + (row.VALOR_TOTAL || 0), 0) / 100;
        console.log(`\n💰 Total Faturado 2026: R$ ${totalFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        console.log(`📊 Total de Itens: ${result.length}`);

        db.detach();
        console.log('\n✅ Consulta concluída!');
    });
});
