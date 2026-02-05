// Script de Sincronização: Firebird → PostgreSQL
// Lê dados de faturamento do Firebird e sincroniza com PostgreSQL (Neon)
// IMPORTANTE: Somente leitura no Firebird, escrita apenas no PostgreSQL

const Firebird = require('node-firebird');
require('dotenv').config({ path: '.env.local' }); // Carregar .env.local
const pool = require('../lib/db'); // Usar pool existente

// =========================================================
// CONFIGURAÇÕES
// =========================================================

// Firebird (Somente Leitura)
const firebirdOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};


// =========================================================
// FUNÇÕES AUXILIARES
// =========================================================

function centavosParaReais(valor) {
    return (valor || 0) / 100;
}

function formatarData(data) {
    if (!data) return null;
    const d = new Date(data);
    return d.toISOString().split('T')[0];
}

// =========================================================
// CRIAR TABELAS NO POSTGRESQL (SE NÃO EXISTIREM)
// =========================================================

async function criarTabelasPostgres() {
    console.log('📋 Verificando/criando tabelas no PostgreSQL...');

    const queries = [
        // Tabela de faturamento diário
        `CREATE TABLE IF NOT EXISTS faturamento_diario (
            id SERIAL PRIMARY KEY,
            data DATE NOT NULL UNIQUE,
            total_notas INTEGER DEFAULT 0,
            total_itens INTEGER DEFAULT 0,
            quantidade_total DECIMAL(15,3) DEFAULT 0,
            valor_total DECIMAL(15,2) DEFAULT 0,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // Tabela de produtos mais vendidos
        `CREATE TABLE IF NOT EXISTS faturamento_top_produtos (
            id SERIAL PRIMARY KEY,
            codigo_produto VARCHAR(50) NOT NULL,
            descricao VARCHAR(255),
            total_vendas INTEGER DEFAULT 0,
            quantidade_total DECIMAL(15,3) DEFAULT 0,
            valor_total DECIMAL(15,2) DEFAULT 0,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(codigo_produto)
        )`,

        // Tabela de estatísticas gerais
        `CREATE TABLE IF NOT EXISTS faturamento_estatisticas (
            id SERIAL PRIMARY KEY,
            periodo VARCHAR(50) NOT NULL UNIQUE,
            total_notas INTEGER DEFAULT 0,
            total_clientes INTEGER DEFAULT 0,
            total_itens INTEGER DEFAULT 0,
            quantidade_total DECIMAL(15,3) DEFAULT 0,
            valor_total DECIMAL(15,2) DEFAULT 0,
            ticket_medio DECIMAL(15,2) DEFAULT 0,
            primeira_nota DATE,
            ultima_nota DATE,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // Índices para performance
        `CREATE INDEX IF NOT EXISTS idx_faturamento_diario_data ON faturamento_diario(data DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_top_produtos_valor ON faturamento_top_produtos(valor_total DESC)`
    ];

    for (const query of queries) {
        await pool.query(query);
    }

    console.log('✅ Tabelas verificadas/criadas com sucesso!');
}

// =========================================================
// SINCRONIZAR FATURAMENTO DIÁRIO
// =========================================================

async function sincronizarFaturamentoDiario(fbDb) {
    console.log('\n📊 Sincronizando faturamento diário...');

    // Buscar últimos 90 dias do Firebird
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - 90);

    const query = `
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
        WHERE nf.EMISSAO_NOT >= ?
            AND nf.TIPO_NOT = 'S'
            AND nf.STATUS_NOT = 'A'
        GROUP BY CAST(nf.EMISSAO_NOT AS DATE)
        ORDER BY DATA_FATURAMENTO DESC
    `;

    return new Promise((resolve, reject) => {
        fbDb.query(query, [dataInicio], async (err, result) => {
            if (err) {
                console.error('❌ Erro ao buscar dados do Firebird:', err);
                return reject(err);
            }

            console.log(`📦 ${result.length} dias de faturamento encontrados`);

            // Limpar dados antigos do PostgreSQL
            await pool.query('DELETE FROM faturamento_diario');

            // Inserir novos dados
            for (const row of result) {
                await pool.query(`
                    INSERT INTO faturamento_diario 
                    (data, total_notas, total_itens, quantidade_total, valor_total)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (data) DO UPDATE SET
                        total_notas = EXCLUDED.total_notas,
                        total_itens = EXCLUDED.total_itens,
                        quantidade_total = EXCLUDED.quantidade_total,
                        valor_total = EXCLUDED.valor_total,
                        atualizado_em = CURRENT_TIMESTAMP
                `, [
                    formatarData(row.DATA_FATURAMENTO),
                    row.TOTAL_NOTAS || 0,
                    row.TOTAL_ITENS || 0,
                    row.QUANTIDADE_TOTAL || 0,
                    centavosParaReais(row.VALOR_TOTAL_CENTAVOS)
                ]);
            }

            console.log('✅ Faturamento diário sincronizado!');
            resolve();
        });
    });
}

// =========================================================
// SINCRONIZAR TOP PRODUTOS
// =========================================================

async function sincronizarTopProdutos(fbDb) {
    console.log('\n🏆 Sincronizando top produtos...');

    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - 90);

    const query = `
        SELECT FIRST 50
            nfp.PRODUTO_NPR as CODIGO_PRODUTO,
            nfp.NOME_PRODUTO_NPR as DESCRICAO,
            COUNT(DISTINCT nf.NUMERO_NOT) as TOTAL_VENDAS,
            SUM(nfp.QUANTIDADE_NPR) as QUANTIDADE_TOTAL,
            SUM(nfp.TOTAL_NPR) as VALOR_TOTAL_CENTAVOS
        FROM NOTA_FISCAL nf
        INNER JOIN NOTA_FISCAL_PRODUTO nfp 
            ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
            AND nf.SERIE_NOT = nfp.SERIE_NPR
            AND nf.CODIGO_NOT = nfp.CODIGO_NPR
        WHERE nf.EMISSAO_NOT >= ?
            AND nf.TIPO_NOT = 'S'
            AND nf.STATUS_NOT = 'A'
        GROUP BY nfp.PRODUTO_NPR, nfp.NOME_PRODUTO_NPR
        ORDER BY VALOR_TOTAL_CENTAVOS DESC
    `;

    return new Promise((resolve, reject) => {
        fbDb.query(query, [dataInicio], async (err, result) => {
            if (err) {
                console.error('❌ Erro ao buscar produtos do Firebird:', err);
                return reject(err);
            }

            console.log(`📦 ${result.length} produtos encontrados`);

            // Limpar dados antigos
            await pool.query('DELETE FROM faturamento_top_produtos');

            // Inserir novos dados
            for (const row of result) {
                await pool.query(`
                    INSERT INTO faturamento_top_produtos 
                    (codigo_produto, descricao, total_vendas, quantidade_total, valor_total)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (codigo_produto) DO UPDATE SET
                        descricao = EXCLUDED.descricao,
                        total_vendas = EXCLUDED.total_vendas,
                        quantidade_total = EXCLUDED.quantidade_total,
                        valor_total = EXCLUDED.valor_total,
                        atualizado_em = CURRENT_TIMESTAMP
                `, [
                    row.CODIGO_PRODUTO,
                    row.DESCRICAO,
                    row.TOTAL_VENDAS || 0,
                    row.QUANTIDADE_TOTAL || 0,
                    centavosParaReais(row.VALOR_TOTAL_CENTAVOS)
                ]);
            }

            console.log('✅ Top produtos sincronizado!');
            resolve();
        });
    });
}

// =========================================================
// SINCRONIZAR ESTATÍSTICAS GERAIS
// =========================================================

async function sincronizarEstatisticas(fbDb) {
    console.log('\n📈 Sincronizando estatísticas gerais...');

    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - 90);

    const query = `
        SELECT 
            COUNT(DISTINCT nf.NUMERO_NOT) as TOTAL_NOTAS,
            COUNT(DISTINCT nf.DESTINATARIO_NOT) as TOTAL_CLIENTES,
            COUNT(nfp.PRODUTO_NPR) as TOTAL_ITENS,
            SUM(nfp.QUANTIDADE_NPR) as QUANTIDADE_TOTAL,
            SUM(nfp.TOTAL_NPR) as VALOR_TOTAL_CENTAVOS,
            MIN(nf.EMISSAO_NOT) as PRIMEIRA_NOTA,
            MAX(nf.EMISSAO_NOT) as ULTIMA_NOTA
        FROM NOTA_FISCAL nf
        INNER JOIN NOTA_FISCAL_PRODUTO nfp 
            ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
            AND nf.SERIE_NOT = nfp.SERIE_NPR
            AND nf.CODIGO_NOT = nfp.CODIGO_NPR
        WHERE nf.EMISSAO_NOT >= ?
            AND nf.TIPO_NOT = 'S'
            AND nf.STATUS_NOT = 'A'
    `;

    return new Promise((resolve, reject) => {
        fbDb.query(query, [dataInicio], async (err, result) => {
            if (err) {
                console.error('❌ Erro ao buscar estatísticas do Firebird:', err);
                return reject(err);
            }

            const stats = result[0];
            const valorTotal = centavosParaReais(stats.VALOR_TOTAL_CENTAVOS);
            const ticketMedio = stats.TOTAL_ITENS > 0 ? valorTotal / stats.TOTAL_ITENS : 0;

            console.log(`📊 Estatísticas: R$ ${valorTotal.toFixed(2)} em ${stats.TOTAL_NOTAS} notas`);

            // Atualizar estatísticas
            await pool.query(`
                INSERT INTO faturamento_estatisticas 
                (periodo, total_notas, total_clientes, total_itens, quantidade_total, 
                 valor_total, ticket_medio, primeira_nota, ultima_nota)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (periodo) DO UPDATE SET
                    total_notas = EXCLUDED.total_notas,
                    total_clientes = EXCLUDED.total_clientes,
                    total_itens = EXCLUDED.total_itens,
                    quantidade_total = EXCLUDED.quantidade_total,
                    valor_total = EXCLUDED.valor_total,
                    ticket_medio = EXCLUDED.ticket_medio,
                    primeira_nota = EXCLUDED.primeira_nota,
                    ultima_nota = EXCLUDED.ultima_nota,
                    atualizado_em = CURRENT_TIMESTAMP
            `, [
                'ultimos_90_dias',
                stats.TOTAL_NOTAS || 0,
                stats.TOTAL_CLIENTES || 0,
                stats.TOTAL_ITENS || 0,
                stats.QUANTIDADE_TOTAL || 0,
                valorTotal,
                ticketMedio,
                formatarData(stats.PRIMEIRA_NOTA),
                formatarData(stats.ULTIMA_NOTA)
            ]);

            console.log('✅ Estatísticas sincronizadas!');
            resolve();
        });
    });
}

// =========================================================
// FUNÇÃO PRINCIPAL
// =========================================================

async function sincronizar() {
    console.log('🚀 INICIANDO SINCRONIZAÇÃO FIREBIRD → POSTGRESQL');
    console.log('='.repeat(60));
    console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);

    try {
        // Criar tabelas no PostgreSQL
        await criarTabelasPostgres();

        // Conectar ao Firebird (somente leitura)
        console.log('\n🔌 Conectando ao Firebird...');
        Firebird.attach(firebirdOptions, async (err, fbDb) => {
            if (err) {
                console.error('❌ Erro ao conectar no Firebird:', err);
                process.exit(1);
            }

            console.log('✅ Conectado ao Firebird!');

            try {
                // Sincronizar todos os dados
                await sincronizarFaturamentoDiario(fbDb);
                await sincronizarTopProdutos(fbDb);
                await sincronizarEstatisticas(fbDb);

                console.log('\n' + '='.repeat(60));
                console.log('✅ SINCRONIZAÇÃO CONCLUÍDA COM SUCESSO!');
                console.log('='.repeat(60));

            } catch (error) {
                console.error('❌ Erro durante sincronização:', error);
            } finally {
                // Desconectar do Firebird
                fbDb.detach();
                await pool.end();
                process.exit(0);
            }
        });

    } catch (error) {
        console.error('❌ Erro fatal:', error);
        process.exit(1);
    }
}

// Executar sincronização
sincronizar();
