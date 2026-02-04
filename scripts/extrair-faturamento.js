require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

// Configuração do Firebird
const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('📊 Consultando faturamento diário do Firebird...\n');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    console.log('✅ Conectado ao Firebird!\n');

    // Query para buscar faturamento com todos os detalhes solicitados
    const query = `
        SELECT FIRST 500
            nf.DATA_EMISSAO_NOT as DATA_FATURAMENTO,
            nf.NUMERO_NOT as PEDIDO,
            nf.ORDEM_COMPRA_NOT as OC,
            nfp.PRODUTO_NPR as CODIGO_ITEM,
            nfp.NOME_PRODUTO_NPR as DESCRICAO,
            nfp.QUANTIDADE_NPR as QUANTIDADE,
            nfp.PRECO_NPR as VALOR_UNITARIO,
            nfp.TOTAL_NPR as VALOR_TOTAL,
            c.RAZAO_SOCIAL_CLI as CLIENTE,
            nf.STATUS_NOT as STATUS,
            nf.SERIE_NOT as SERIE
        FROM NOTA_FISCAL nf
        LEFT JOIN NOTA_FISCAL_PRODUTO nfp 
            ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
            AND nf.SERIE_NOT = nfp.SERIE_NPR
            AND nf.CODIGO_NOT = nfp.CODIGO_NPR
        LEFT JOIN CLIENTE c 
            ON nf.CLI_EMPRESA_NOT = c.EMPRESA_CLI 
            AND nf.CLIFOR_NOT = c.CODIGO_CLI
        WHERE nf.DATA_EMISSAO_NOT IS NOT NULL
            AND nf.TIPO_NOT = 'S'
            AND nfp.PRODUTO_NPR IS NOT NULL
        ORDER BY nf.DATA_EMISSAO_NOT DESC, nf.NUMERO_NOT DESC
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('❌ Erro ao consultar:', err);
            db.detach();
            return;
        }

        console.log(`✅ ${result.length} registros encontrados!\n`);
        console.log('='.repeat(150));
        console.log('DATA       | PEDIDO | OC          | CÓD.ITEM | DESCRIÇÃO                    | QTD      | VL.UNIT  | VL.TOTAL | CLIENTE');
        console.log('='.repeat(150));

        result.forEach(row => {
            const data = row.DATA_FATURAMENTO ? row.DATA_FATURAMENTO.toISOString().split('T')[0] : 'N/A';
            const pedido = row.PEDIDO || 'N/A';
            const oc = (row.OC || '').trim().substring(0, 11);
            const codItem = row.CODIGO_ITEM || 'N/A';
            const descricao = (row.DESCRICAO || '').trim().substring(0, 28).padEnd(28);
            const qtd = (row.QUANTIDADE || 0).toString().padStart(8);
            const vlUnit = ((row.VALOR_UNITARIO || 0) / 100).toFixed(2).padStart(8);
            const vlTotal = ((row.VALOR_TOTAL || 0) / 100).toFixed(2).padStart(8);
            const cliente = (row.CLIENTE || '').trim().substring(0, 30);

            console.log(`${data} | ${pedido.toString().padStart(6)} | ${oc.padEnd(11)} | ${codItem.toString().padStart(8)} | ${descricao} | ${qtd} | ${vlUnit} | ${vlTotal} | ${cliente}`);
        });

        console.log('='.repeat(150));
        console.log(`\n💾 Total de registros: ${result.length}`);

        // Calcular total faturado
        const totalFaturado = result.reduce((sum, row) => sum + (row.VALOR_TOTAL || 0), 0) / 100;
        console.log(`💰 Total Faturado: R$ ${totalFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

        // Salvar em JSON para uso na API
        const fs = require('fs');
        const dataFormatted = result.map(row => ({
            data: row.DATA_FATURAMENTO ? row.DATA_FATURAMENTO.toISOString().split('T')[0] : null,
            pedido: row.PEDIDO,
            oc: row.OC ? row.OC.trim() : null,
            codigoItem: row.CODIGO_ITEM,
            descricao: row.DESCRICAO ? row.DESCRICAO.trim() : null,
            quantidade: row.QUANTIDADE || 0,
            valorUnitario: (row.VALOR_UNITARIO || 0) / 100,
            valorTotal: (row.VALOR_TOTAL || 0) / 100,
            cliente: row.CLIENTE ? row.CLIENTE.trim() : null,
            status: row.STATUS ? row.STATUS.trim() : null,
            ano: row.ANO
        }));

        fs.writeFileSync('faturamento-data.json', JSON.stringify(dataFormatted, null, 2));
        console.log('\n✅ Dados salvos em faturamento-data.json');

        db.detach();
    });
});
