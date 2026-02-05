// Script para CONSULTAR e ANALISAR dados de faturamento diário do Firebird
// SOMENTE LEITURA - NÃO ALTERA NADA NO BANCO

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

console.log('📊 ANÁLISE DE FATURAMENTO DIÁRIO - SOMENTE LEITURA\n');
console.log('='.repeat(100));

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err.message);
        return;
    }

    console.log('✅ Conectado ao Firebird\n');

    // 1. Consultar faturamento dos últimos 30 dias agrupado por dia
    const queryFaturamentoDiario = `
        SELECT 
            CAST(nf.EMISSAO_NOT AS DATE) as DATA_FATURAMENTO,
            COUNT(DISTINCT nf.NUMERO_NOT) as TOTAL_NOTAS,
            COUNT(nfp.PRODUTO_NPR) as TOTAL_ITENS,
            SUM(nfp.QUANTIDADE_NPR) as QUANTIDADE_TOTAL,
            SUM(nfp.TOTAL_NPR) as VALOR_TOTAL_CENTAVOS
        FROM NOTA_FISCAL nf
        INNER JOIN NOTA_FISCAL_PRODUTO nfp 
            ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
            AND nf.SERIE_NOT = nfp.SERIE_NPR
            AND nf.CODIGO_NOT = nfp.CODIGO_NPR
        WHERE nf.EMISSAO_NOT >= DATEADD(-30 DAY TO CURRENT_DATE)
            AND nf.TIPO_NOT = 'S'
            AND nf.STATUS_NOT = 'A'
        GROUP BY CAST(nf.EMISSAO_NOT AS DATE)
        ORDER BY DATA_FATURAMENTO DESC
    `;

    console.log('🔍 Consultando faturamento dos últimos 30 dias...\n');

    db.query(queryFaturamentoDiario, function (err, result) {
        if (err) {
            console.error('❌ Erro na consulta:', err.message);
            db.detach();
            return;
        }

        console.log('📈 FATURAMENTO DIÁRIO (Últimos 30 dias)');
        console.log('-'.repeat(100));
        console.log(
            'Data'.padEnd(15),
            'Notas'.padEnd(10),
            'Itens'.padEnd(10),
            'Quantidade'.padEnd(15),
            'Valor Total (R$)'.padEnd(20)
        );
        console.log('-'.repeat(100));

        let totalGeral = 0;
        let totalNotas = 0;
        let totalItens = 0;

        result.forEach(row => {
            const data = row.DATA_FATURAMENTO ? row.DATA_FATURAMENTO.toISOString().split('T')[0] : 'N/A';
            const notas = row.TOTAL_NOTAS || 0;
            const itens = row.TOTAL_ITENS || 0;
            const quantidade = (row.QUANTIDADE_TOTAL || 0).toFixed(2);
            const valorTotal = (row.VALOR_TOTAL_CENTAVOS || 0) / 100;

            totalGeral += valorTotal;
            totalNotas += notas;
            totalItens += itens;

            console.log(
                data.padEnd(15),
                String(notas).padEnd(10),
                String(itens).padEnd(10),
                quantidade.padEnd(15),
                `R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`.padEnd(20)
            );
        });

        console.log('-'.repeat(100));
        console.log(`TOTAL: ${totalNotas} notas | ${totalItens} itens | R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        console.log('='.repeat(100));

        // 2. Consultar top 10 produtos mais faturados
        const queryTopProdutos = `
            SELECT FIRST 10
                nfp.PRODUTO_NPR as CODIGO_PRODUTO,
                nfp.NOME_PRODUTO_NPR as DESCRICAO,
                COUNT(*) as TOTAL_VENDAS,
                SUM(nfp.QUANTIDADE_NPR) as QUANTIDADE_TOTAL,
                SUM(nfp.TOTAL_NPR) as VALOR_TOTAL_CENTAVOS
            FROM NOTA_FISCAL nf
            INNER JOIN NOTA_FISCAL_PRODUTO nfp 
                ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
                AND nf.SERIE_NOT = nfp.SERIE_NPR
                AND nf.CODIGO_NOT = nfp.CODIGO_NPR
            WHERE nf.EMISSAO_NOT >= DATEADD(-30 DAY TO CURRENT_DATE)
                AND nf.TIPO_NOT = 'S'
                AND nf.STATUS_NOT = 'A'
                AND nfp.PRODUTO_NPR IS NOT NULL
            GROUP BY nfp.PRODUTO_NPR, nfp.NOME_PRODUTO_NPR
            ORDER BY VALOR_TOTAL_CENTAVOS DESC
        `;

        console.log('\n🏆 TOP 10 PRODUTOS MAIS FATURADOS (Últimos 30 dias)\n');

        db.query(queryTopProdutos, function (err, result) {
            if (err) {
                console.error('❌ Erro na consulta de produtos:', err.message);
                db.detach();
                return;
            }

            console.log('-'.repeat(100));
            console.log(
                'Código'.padEnd(12),
                'Descrição'.padEnd(35),
                'Vendas'.padEnd(10),
                'Qtd'.padEnd(12),
                'Valor Total (R$)'.padEnd(20)
            );
            console.log('-'.repeat(100));

            result.forEach((row, index) => {
                const codigo = String(row.CODIGO_PRODUTO || 'N/A').padEnd(12);
                const descricao = (row.DESCRICAO || 'Sem descrição').trim().substring(0, 33).padEnd(35);
                const vendas = String(row.TOTAL_VENDAS || 0).padEnd(10);
                const quantidade = (row.QUANTIDADE_TOTAL || 0).toFixed(2).padEnd(12);
                const valorTotal = ((row.VALOR_TOTAL_CENTAVOS || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

                console.log(
                    `${index + 1}.`.padEnd(4),
                    codigo,
                    descricao,
                    vendas,
                    quantidade,
                    `R$ ${valorTotal}`
                );
            });

            console.log('='.repeat(100));

            // 3. Consultar estatísticas gerais
            const queryEstatisticas = `
                SELECT 
                    COUNT(DISTINCT nf.NUMERO_NOT) as TOTAL_NOTAS_MES,
                    COUNT(DISTINCT nf.DESTINATARIO_NOT) as TOTAL_CLIENTES,
                    AVG(nfp.TOTAL_NPR) as TICKET_MEDIO_ITEM,
                    MIN(nf.EMISSAO_NOT) as PRIMEIRA_NOTA,
                    MAX(nf.EMISSAO_NOT) as ULTIMA_NOTA
                FROM NOTA_FISCAL nf
                INNER JOIN NOTA_FISCAL_PRODUTO nfp 
                    ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
                    AND nf.SERIE_NOT = nfp.SERIE_NPR
                    AND nf.CODIGO_NOT = nfp.CODIGO_NPR
                WHERE nf.EMISSAO_NOT >= DATEADD(-30 DAY TO CURRENT_DATE)
                    AND nf.TIPO_NOT = 'S'
                    AND nf.STATUS_NOT = 'A'
            `;

            console.log('\n📊 ESTATÍSTICAS GERAIS (Últimos 30 dias)\n');

            db.query(queryEstatisticas, function (err, result) {
                if (err) {
                    console.error('❌ Erro na consulta de estatísticas:', err.message);
                } else if (result.length > 0) {
                    const stats = result[0];
                    console.log('-'.repeat(100));
                    console.log(`Total de Notas Fiscais: ${stats.TOTAL_NOTAS_MES || 0}`);
                    console.log(`Total de Clientes Atendidos: ${stats.TOTAL_CLIENTES || 0}`);
                    console.log(`Ticket Médio por Item: R$ ${((stats.TICKET_MEDIO_ITEM || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
                    console.log(`Primeira Nota: ${stats.PRIMEIRA_NOTA ? stats.PRIMEIRA_NOTA.toISOString().split('T')[0] : 'N/A'}`);
                    console.log(`Última Nota: ${stats.ULTIMA_NOTA ? stats.ULTIMA_NOTA.toISOString().split('T')[0] : 'N/A'}`);
                    console.log('-'.repeat(100));
                }

                console.log('\n✅ Análise concluída com sucesso!');
                console.log('='.repeat(100));
                db.detach();
            });
        });
    });
});
