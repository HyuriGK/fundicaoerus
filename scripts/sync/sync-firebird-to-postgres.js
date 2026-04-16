// Script de Sincronização: Firebird → PostgreSQL
// Lê dados de faturamento do Firebird e sincroniza com PostgreSQL (Neon)
// IMPORTANTE: Somente leitura no Firebird, escrita apenas no PostgreSQL


const path = require('path');
const fs = require('fs');

// Usar helper centralizado e pool existente
const pool = require('../../lib/db');

// =========================================================
// CONFIGURAÇÕES
// =========================================================

// Firebird (Somente Leitura)
const { Firebird, options: firebirdOptions } = require('../../lib/firebird-helper');


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

function chunkArray(myArray, chunk_size) {
    var index = 0;
    var arrayLength = myArray.length;
    var tempArray = [];

    for (index = 0; index < arrayLength; index += chunk_size) {
        myChunk = myArray.slice(index, index + chunk_size);
        tempArray.push(myChunk);
    }
    return tempArray;
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
            peso_total DECIMAL(15,3) DEFAULT 0,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        // Garantir que peso_total existe para instalações existentes
        `ALTER TABLE faturamento_diario ADD COLUMN IF NOT EXISTS peso_total DECIMAL(15,3) DEFAULT 0`
    ];

    for (const query of queries) {
        await pool.query(query);
    }

    console.log('✅ Tabelas verificadas/criadas com sucesso!');
}

// =========================================================
// SINCRONIZAR FATURAMENTO DIÁRIO
// =========================================================

async function sincronizarFaturamentoDiario() {
    console.log('\n📊 Reconstruindo faturamento diário (No PostgreSQL)...');
    
    // Agora fazemos a agregação diretamente no PostgreSQL baseado na tabela de detalhes já sincronizada
    // Isso é ordens de magnitude mais rápido que buscar tudo no Firebird toda vez
    try {
        await pool.query(`
            WITH agregados AS (
                SELECT 
                    data_faturamento as data,
                    COUNT(DISTINCT nota_fiscal) as total_notas,
                    COUNT(*) as total_itens,
                    SUM(quantidade) as quantidade_total,
                    SUM(valor_total) as valor_total,
                    SUM(peso_total) as peso_total
                FROM faturamento_firebird
                WHERE data_faturamento >= '2026-01-01' AND (excluido_manualmente = FALSE OR excluido_manualmente IS NULL)
                GROUP BY data_faturamento
            )
            INSERT INTO faturamento_diario 
            (data, total_notas, total_itens, quantidade_total, valor_total, peso_total)
            SELECT data, total_notas, total_itens, quantidade_total, valor_total, peso_total FROM agregados
            ON CONFLICT (data) DO UPDATE SET
                total_notas = EXCLUDED.total_notas,
                total_itens = EXCLUDED.total_itens,
                quantidade_total = EXCLUDED.quantidade_total,
                valor_total = EXCLUDED.valor_total,
                peso_total = EXCLUDED.peso_total,
                atualizado_em = CURRENT_TIMESTAMP
        `);
        console.log('✅ Faturamento diário atualizado (Postgres)!');
    } catch (err) {
        console.error('❌ Erro ao atualizar faturamento diário no Postgres:', err);
        throw err;
    }
}

// Sincronização de Top Produtos Removida a pedido do usuário

// =========================================================
// SINCRONIZAR DETALHADO (Para Modal de Registros)
// =========================================================

async function sincronizarDetalhado(fbDb) {
    console.log('\n📝 Sincronizando registros detalhados (Notas + Itens)...');

    // Tabela detalhada que o faturamento-neon.js já espera
    await pool.query(`CREATE TABLE IF NOT EXISTS faturamento_firebird (
        id SERIAL PRIMARY KEY,
        nota_fiscal INTEGER NOT NULL,
        pedido VARCHAR(50),
        serie VARCHAR(10),
        item_nota INTEGER NOT NULL,
        data_faturamento DATE,
        cliente_codigo VARCHAR(20),
        cliente_nome VARCHAR(255),
        codigo_item VARCHAR(50),
        descricao VARCHAR(255),
        quantidade DECIMAL(15, 3),
        valor_unitario DECIMAL(15, 2),
        valor_total DECIMAL(15, 2),
        status VARCHAR(10),
        excluido_manualmente BOOLEAN DEFAULT FALSE,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(nota_fiscal, serie, item_nota, codigo_item)
    )`);

    // Garanir que as colunas existem
    await pool.query(`ALTER TABLE faturamento_firebird ADD COLUMN IF NOT EXISTS pedido VARCHAR(50)`);
    await pool.query(`ALTER TABLE faturamento_firebird ADD COLUMN IF NOT EXISTS item_nota INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE faturamento_firebird ADD COLUMN IF NOT EXISTS peso_un DECIMAL(15, 3) DEFAULT 0`);
    await pool.query(`ALTER TABLE faturamento_firebird ADD COLUMN IF NOT EXISTS peso_total DECIMAL(15, 3) DEFAULT 0`);
    await pool.query(`ALTER TABLE faturamento_firebird ADD COLUMN IF NOT EXISTS excluido_manualmente BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE faturamento_firebird ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    // Atualizar constraint se necessário
    try {
        // Drop antiga se existir
        await pool.query(`ALTER TABLE faturamento_firebird DROP CONSTRAINT IF EXISTS faturamento_firebird_nota_fiscal_serie_codigo_item_key`);
        // Adicionar nova se não existir
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faturamento_firebird_nf_serie_item_prod_key') THEN
                    ALTER TABLE faturamento_firebird ADD CONSTRAINT faturamento_firebird_nf_serie_item_prod_key UNIQUE(nota_fiscal, serie, item_nota, codigo_item);
                END IF;
            END $$;
        `);
    } catch (e) {
        console.warn('⚠️  Aviso ao atualizar constraints:', e.message);
    }

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fat_fb_data ON faturamento_firebird(data_faturamento DESC)`);

    // OTIMIZAÇÃO: Sincronização Incremental (Janela de 90 dias)
    // Em vez de buscar o ano todo, buscamos apenas os últimos 90 dias.
    // Isso reduz o processamento drasticamente e acelera a sincronização.
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - 90);
    console.log(`📅 Janela de Sincronização: ${dataInicio.toISOString().split('T')[0]} até hoje.`);

    const query = `
    SELECT
    nf.CODIGO_NOT,
        nf.NUMERO_NOT,
        nf.SERIE_NOT,
        CAST(nf.EMISSAO_NOT AS DATE) as DATA_FATURAMENTO,
        nf.DESTINATARIO_NOT as COD_CLIENTE_NOT,
        nf.RAZAO_SOCIAL_NOT as CLIENTE_NOME_NOT,
        nf.STATUS_NOT,
        nfp.ITEM_NPR,
        nfp.PEDIDO_NPR,
        (SELECT FIRST 1 npe.PEDIDO_NPE FROM NOTA_FISCAL_PEDIDO npe 
         WHERE npe.NOT_ID_NPE = nf.ID_NOT) as PEDIDO_LINK,
        nfp.PRODUTO_NPR,
        nfp.NOME_PRODUTO_NPR,
        nfp.QUANTIDADE_NPR,
        nfp.PRECO_NPR as UNITARIO_NPR,
        nfp.TOTAL_NPR,
        p.PESO_LIQUIDO_PRO as PESO_UNITARIO
        FROM NOTA_FISCAL nf
        INNER JOIN NOTA_FISCAL_PRODUTO nfp 
            ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
            AND nf.SERIE_NOT = nfp.SERIE_NPR
            AND nf.CODIGO_NOT = nfp.CODIGO_NPR
        LEFT JOIN PRODUTO p
            ON nfp.PRODUTO_NPR = p.CODIGO_PRO
        WHERE nf.EMISSAO_NOT >= ?
        AND nf.TIPO_NOT = 'S'
            AND nf.STATUS_NOT = 'A'
        ORDER BY nf.EMISSAO_NOT DESC
    `;

    return new Promise((resolve, reject) => {
        fbDb.query(query, [dataInicio], async (err, result) => {
            if (err) {
                console.error('❌ Erro ao buscar detalhado do Firebird:', err);
                return reject(err);
            }

            console.log(`📦 ${result.length} itens de nota encontrados`);

            // OTIMIZAÇÃO: Removemos o DELETE global para evitar o "Nuclear Option" toda vez.
            // Os dados antigos permanecem e os novos são atualizados via ON CONFLICT.
            // console.log('  🗑️ Limpando registros de faturamento detalhado...');
            
            // BUSCAR PREFERÊNCIAS DE EXCLUSÃO (Tabela correta: faturamento_firebird_preferencias)
            const prefsResult = await pool.query('SELECT nota_fiscal, codigo_item, pedido, data_faturamento, quantidade, excluido FROM faturamento_firebird_preferencias');
            const prefsMap = new Map();
            prefsResult.rows.forEach(r => {
                const dateStr = r.data_faturamento ? r.data_faturamento.toISOString().split('T')[0] : '';
                const qStr = parseFloat(r.quantidade || 0);
                const key = `${r.nota_fiscal}-${String(r.codigo_item).trim()}-${String(r.pedido || '').trim()}-${dateStr}-${qStr}`;
                prefsMap.set(key, r.excluido);
            });

            let inserted = 0;
            let errors = 0;

            // OTIMIZAÇÃO: Processamento Concorrente em Lotes (Chunks)
            // Processa blocos de 50 registros simultaneamente para maior velocidade
            const insertChunks = chunkArray(result, 50);

            for (const chunk of insertChunks) {
                const promises = chunk.map(async (row) => {
                    try {
                        const notaFiscal = parseInt(row.CODIGO_NOT);
                        if (isNaN(notaFiscal)) {
                            // console.warn(`  ⚠️  Nota Fiscal inválida(Cód: ${row.CODIGO_NOT}), pulando item.`);
                            errors++;
                            return;
                        }

                        const pesoUn = parseFloat(row.PESO_UNITARIO) || 0;
                        const quantidade = parseFloat(row.QUANTIDADE_NPR) || 0;
                        const pesoTotal = pesoUn * quantidade;
                        const dataFat = formatarData(row.DATA_FATURAMENTO);
                        const codigoItem = row.PRODUTO_NPR;
                        const itemNota = parseInt(row.ITEM_NPR) || 0;

                        // Gerar chave única para conferir preferência (Lógica C: Nota-Item-Pedido-Data-Quant)
                        const pedidoFinal = String(row.PEDIDO_LINK || row.PEDIDO_NPR || '').trim();
                        // IMPORTANT: Must match frontend logic (String(parseFloat(quant)))
                        const qStr = parseFloat(quantidade);
                        const keyForPref = `${notaFiscal}-${String(codigoItem).trim()}-${pedidoFinal}-${dataFat}-${qStr}`;
                        const isExcluded = prefsMap.has(keyForPref) ? prefsMap.get(keyForPref) : false;

                        await pool.query(`
                            INSERT INTO faturamento_firebird 
                            (nota_fiscal, serie, item_nota, data_faturamento, cliente_codigo, cliente_nome, 
                             codigo_item, descricao, quantidade, valor_unitario, valor_total, 
                             peso_un, peso_total, status, excluido_manualmente, pedido)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                            ON CONFLICT ON CONSTRAINT faturamento_firebird_nf_serie_item_prod_key DO UPDATE SET
                                data_faturamento = EXCLUDED.data_faturamento,
                                cliente_nome = EXCLUDED.cliente_nome,
                                descricao = EXCLUDED.descricao,
                                quantidade = EXCLUDED.quantidade,
                                valor_unitario = EXCLUDED.valor_unitario,
                                valor_total = EXCLUDED.valor_total,
                                peso_un = EXCLUDED.peso_un,
                                peso_total = EXCLUDED.peso_total,
                                status = EXCLUDED.status,
                                excluido_manualmente = EXCLUDED.excluido_manualmente,
                                pedido = EXCLUDED.pedido,
                                atualizado_em = CURRENT_TIMESTAMP
                        `, [
                            notaFiscal,
                            row.SERIE_NOT ? String(row.SERIE_NOT).trim() : null,
                            itemNota,
                            dataFat,
                            row.COD_CLIENTE_NOT,
                            row.CLIENTE_NOME_NOT,
                            codigoItem,
                            row.NOME_PRODUTO_NPR,
                            quantidade,
                            centavosParaReais(row.UNITARIO_NPR),
                            centavosParaReais(row.TOTAL_NPR),
                            pesoUn,
                            pesoTotal,
                            row.STATUS_NOT,
                            isExcluded,
                            pedidoFinal
                        ]);

                        inserted++;
                    } catch (rowErr) {
                        console.error(`  ❌ Erro no item NF ${row.CODIGO_NOT}:`, rowErr.message);
                        errors++;
                    }
                });

                await Promise.all(promises);
                if (inserted % 100 === 0 || inserted === result.length) {
                    const pct = ((inserted / result.length) * 100).toFixed(0);
                    process.stdout.write(`@PROG:FATURAMENTO:${pct}%\n`);
                }
            }

            resolve();
        });
    });
}

// =========================================================
// SINCRONIZAR ESTATÍSTICAS GERAIS
// =========================================================

async function sincronizarEstatisticas() {
    console.log('\n📈 Atualizando estatísticas gerais (No PostgreSQL)...');

    try {
        await pool.query(`
            WITH stats AS (
                SELECT 
                    COUNT(DISTINCT nota_fiscal) as total_notas,
                    COUNT(DISTINCT cliente_codigo) as total_clientes,
                    COUNT(*) as total_itens,
                    SUM(quantidade) as quantidade_total,
                    SUM(valor_total) as valor_total,
                    MIN(data_faturamento) as primeira_nota,
                    MAX(data_faturamento) as ultima_nota
                FROM faturamento_firebird
                WHERE data_faturamento >= '2026-01-01' AND (excluido_manualmente = FALSE OR excluido_manualmente IS NULL)
            )
            INSERT INTO faturamento_estatisticas 
            (periodo, total_notas, total_clientes, total_itens, quantidade_total, 
             valor_total, ticket_medio, primeira_nota, ultima_nota)
            SELECT 
                'ultimos_90_dias',
                total_notas, total_clientes, total_itens, quantidade_total, 
                valor_total, (CASE WHEN total_itens > 0 THEN valor_total / total_itens ELSE 0 END), 
                primeira_nota, ultima_nota
            FROM stats
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
        `);
        console.log('✅ Estatísticas sincronizadas (Postgres)!');
    } catch (err) {
        console.error('❌ Erro ao atualizar estatísticas no Postgres:', err);
    }
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
                // Sincronizar todos os dados - Prioridade para o Detalhado (faturamentos.html)
                await sincronizarDetalhado(fbDb);
                await sincronizarFaturamentoDiario(); // Agora no Postgres
                await sincronizarEstatisticas();      // Agora no Postgres

                console.log('\n' + '='.repeat(60));
                console.log('✅ SINCRONIZAÇÃO CONCLUÍDA COM SUCESSO!');
                console.log('='.repeat(60));

                // Atualizar status de sincronização
                try {
                    await pool.query("SET TIME ZONE 'America/Sao_Paulo'");
                    await pool.query(`
                        INSERT INTO sync_status (screen_name, last_sync_at)
                        VALUES ('Faturamento', NOW())
                        ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
                    `);
                    console.log('📊 Status de sincronização atualizado para: Faturamento');
                } catch (statusErr) {
                    console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
                }

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
