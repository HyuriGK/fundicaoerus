require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const Firebird = require('node-firebird');
const pool = require('../lib/db');

const FIREBIRD_OPTIONS = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

async function createTableIfNotExists() {
    console.log('📡 Tentando conectar ao Postgres para verificar tabela...');
    const client = await pool.connect();
    console.log('✅ Conectado ao Postgres.');
    try {
        console.log('🛠️ [1/4] Criando Tabela (se necessário)...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS custos_registros (
                id SERIAL PRIMARY KEY,
                categoria VARCHAR(50) NOT NULL,
                nome VARCHAR(255) NOT NULL,
                produto VARCHAR(255),
                produto_cod VARCHAR(50),
                fornecedor VARCHAR(255),
                valor NUMERIC(15,2) DEFAULT 0,
                documento VARCHAR(100),
                data_emissao DATE,
                mes INTEGER,
                ano INTEGER,
                atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS produto VARCHAR(255);
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS produto_cod VARCHAR(50);
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS fornecedor VARCHAR(255);

            -- REMOVER ÍNDICE PARA PERMITIR LIMPEZA (Se ele existir de uma falha anterior)
            DROP INDEX IF EXISTS idx_custos_unique_upsert;
        `);

        console.log('🛠️ [2/4] Normalizando dados para Índice Único...');
        await client.query(`
            UPDATE custos_registros SET documento = TRIM(COALESCE(documento, '')) WHERE documento IS NULL OR documento != TRIM(documento);
            UPDATE custos_registros SET produto_cod = TRIM(COALESCE(produto_cod, '')) WHERE produto_cod IS NULL OR produto_cod != TRIM(produto_cod);
            UPDATE custos_registros SET fornecedor = TRIM(COALESCE(fornecedor, '')) WHERE fornecedor IS NULL OR fornecedor != TRIM(fornecedor);

            ALTER TABLE custos_registros ALTER COLUMN documento SET DEFAULT '';
            ALTER TABLE custos_registros ALTER COLUMN produto_cod SET DEFAULT '';
            ALTER TABLE custos_registros ALTER COLUMN fornecedor SET DEFAULT '';
        `);

        console.log('🛠️ [3/4] Removendo duplicatas legadas...');
        await client.query(`
            DELETE FROM custos_registros
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY 
                                 TRIM(categoria), 
                                 TRIM(COALESCE(documento, '')), 
                                 TRIM(COALESCE(produto_cod, '')), 
                                 TRIM(COALESCE(fornecedor, '')), 
                                 data_emissao, 
                                 valor
                               ORDER BY id DESC
                           ) as row_num
                    FROM custos_registros
                ) t
                WHERE t.row_num > 1
            );
        `);

        console.log('🛠️ [4/4] Gerando Índice de Sincronização Incremental...');
        await client.query(`
            CREATE UNIQUE INDEX idx_custos_unique_upsert 
            ON custos_registros(categoria, documento, produto_cod, fornecedor, data_emissao, valor);

            CREATE INDEX IF NOT EXISTS idx_custos_registros_mes_ano ON custos_registros(mes, ano);
            CREATE INDEX IF NOT EXISTS idx_custos_registros_categoria ON custos_registros(categoria);
        `);
        
        console.log('✅ Tabela custos_registros inicializada com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao criar tabela no Postgres:', error);
        throw error;
    } finally {
        client.release();
        console.log('ℹ️ Conexão Postgres liberada.');
    }
}

async function syncData() {
    console.log(`\n🚀 Iniciando sincronização de Custos Granular (Firebird -> Postgres) - ${new Date().toLocaleString()}`);

    // await createTableIfNotExists();

    console.log('📡 Tentando conectar ao Firebird...');
    const dbFb = await new Promise((resolve, reject) => {
        let retries = 0;
        const connect = () => {
            Firebird.attach(FIREBIRD_OPTIONS, (err, db) => {
                if (err) {
                    if (retries < 3) {
                        retries++;
                        console.warn(`⏳ Falha ao conectar no Firebird. Tentativa ${retries}/3...`);
                        setTimeout(connect, 2000);
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(db);
                }
            });
        };
        connect();
    });

    console.log('✅ Conectado ao Firebird com sucesso.');

    // Removemos o agrupamento (GROUP BY) e o limitador (FIRST 20)
    // Coleta o registro cru: Nome, Valor Específico do item, a Data e NF.
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - 90);
    const dataInicioStr = dataInicio.toISOString().split('T')[0];
    console.log(`📅 Janela de Sincronização: ${dataInicioStr} até hoje.`);

    const queries = {
        fornecedores: `
            SELECT 
                COALESCE(FORN.RAZAO_SOCIAL_FRN, 'DESCONHECIDO') AS NOME,
                CP.NOME_PRODUTO_CPR AS PRODUTO,
                CP.PRODUTO_CPR AS PRODUTO_COD,
                COALESCE(FORN.RAZAO_SOCIAL_FRN, 'DESCONHECIDO') AS FORNECEDOR,
                CP.VALOR_PRODUTOS_CPR AS VALOR,
                C.EMISSAO_COM AS DATA_EMISSAO,
                C.NUMERO_COM AS DOCUMENTO,
                EXTRACT(MONTH FROM C.EMISSAO_COM) AS MES,
                EXTRACT(YEAR FROM C.EMISSAO_COM) AS ANO
            FROM COMPRA_PRODUTO CP
            JOIN COMPRA C ON CP.COM_ID_CPR = C.ID_COM
            LEFT JOIN FORNECEDOR FORN ON CP.FORNECEDOR_CPR = FORN.CODIGO_FRN
            WHERE C.EMISSAO_COM >= ? AND C.PARA_COM = 'F'
        `,
        tipos: `
            SELECT 
                COALESCE(DES.NOME_DES, 'NAO CATEGORIZADO') AS NOME,
                CP.NOME_PRODUTO_CPR AS PRODUTO,
                CP.PRODUTO_CPR AS PRODUTO_COD,
                COALESCE(FORN.RAZAO_SOCIAL_FRN, 'DESCONHECIDO') AS FORNECEDOR,
                CP.VALOR_PRODUTOS_CPR AS VALOR,
                C.EMISSAO_COM AS DATA_EMISSAO,
                C.NUMERO_COM AS DOCUMENTO,
                EXTRACT(MONTH FROM C.EMISSAO_COM) AS MES,
                EXTRACT(YEAR FROM C.EMISSAO_COM) AS ANO
            FROM COMPRA_PRODUTO CP
            JOIN COMPRA C ON CP.COM_ID_CPR = C.ID_COM
            LEFT JOIN DESPESA DES ON C.DESPESA_COM = DES.CODIGO_DES
            LEFT JOIN FORNECEDOR FORN ON CP.FORNECEDOR_CPR = FORN.CODIGO_FRN
            WHERE C.EMISSAO_COM >= ? AND DES.NOME_DES IS NOT NULL AND C.PARA_COM = 'F'
        `,
        setores: `
            SELECT 
                COALESCE(CC.NOME_CTU, 'GERAL / NAO ALOCADO') AS NOME,
                NULL AS PRODUTO,
                NULL AS PRODUTO_COD,
                COALESCE(FORN.RAZAO_SOCIAL_FRN, 'PAGAMENTO DIRETO') AS FORNECEDOR,
                PAG.VALOR_PARCELA_PAG AS VALOR,
                PAG.DATA_EMISSAO_PAG AS DATA_EMISSAO,
                PAG.DOCUMENTO_PAG AS DOCUMENTO,
                EXTRACT(MONTH FROM PAG.DATA_EMISSAO_PAG) AS MES,
                PAG.ANO_PAG AS ANO
            FROM PAGAR PAG
            LEFT JOIN CENTRO_CUSTO CC ON PAG.CTU_CODIGO_PAG = CC.CODIGO_CTU
            LEFT JOIN FORNECEDOR FORN ON PAG.FORNECEDOR_PAG = FORN.CODIGO_FRN
            WHERE PAG.DATA_EMISSAO_PAG >= ?
        `,
        materiais: `
            SELECT 
                COALESCE(PRO.NOME_PRO, 'DIVERSOS') AS NOME,
                CP.NOME_PRODUTO_CPR AS PRODUTO,
                CP.PRODUTO_CPR AS PRODUTO_COD,
                COALESCE(FORN.RAZAO_SOCIAL_FRN, 'DESCONHECIDO') AS FORNECEDOR,
                CP.VALOR_PRODUTOS_CPR AS VALOR,
                C.EMISSAO_COM AS DATA_EMISSAO,
                C.NUMERO_COM AS DOCUMENTO,
                EXTRACT(MONTH FROM C.EMISSAO_COM) AS MES,
                EXTRACT(YEAR FROM C.EMISSAO_COM) AS ANO
            FROM COMPRA_PRODUTO CP
            JOIN COMPRA C ON CP.COM_ID_CPR = C.ID_COM
            LEFT JOIN PRODUTO PRO ON CP.PRODUTO_CPR = PRO.CODIGO_PRO
            LEFT JOIN FORNECEDOR FORN ON CP.FORNECEDOR_CPR = FORN.CODIGO_FRN
            WHERE C.EMISSAO_COM >= ? AND C.PARA_COM = 'F'
        `
    };

    const fetchFbData = (q, name, params = []) => {
        return new Promise((resolve) => {
            dbFb.query(q, params, (err, res) => {
                if (err) {
                    console.error(`❌ Erro ao buscar ${name} no Firebird:`, err.message);
                    resolve([]);
                } else {
                    resolve(res || []);
                }
            });
        });
    };

    try {
        console.log('📥 Extraindo registros granulares do Firebird (pesado)...');
        const dados = {
            fornecedores: await fetchFbData(queries.fornecedores, 'Fornecedores', [dataInicio]),
            tipos: await fetchFbData(queries.tipos, 'Tipos', [dataInicio]),
            setores: await fetchFbData(queries.setores, 'Setores', [dataInicio]),
            materiais: await fetchFbData(queries.materiais, 'Materiais', [dataInicio])
        };

        dbFb.detach();
        console.log('✅ Extração concluída. Fechando conexão Firebird.');

        const client = await pool.connect();
        try {
            // Chamada de migração para o mestre
            await createTableIfNotExists();

            let totalInseridos = 0;
            const totalGeral = (dados.fornecedores?.length || 0) + 
                               (dados.tipos?.length || 0) + 
                               (dados.setores?.length || 0) + 
                               (dados.materiais?.length || 0);

            const insertBatch = async (cat, rows) => {
                // Deduplicação em tempo de execução para evitar erro de "ON CONFLICT" no mesmo lote
                const uniqueRows = [];
                const seenKeys = new Set();
                rows.forEach(r => {
                    const key = `${cat}|${String(r.DOCUMENTO || '')}|${String(r.PRODUTO_COD || '')}|${String(r.FORNECEDOR || '')}|${r.DATA_EMISSAO}|${r.VALOR}`.toUpperCase();
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        uniqueRows.push(r);
                    }
                });

                const BATCH_SIZE = 200; // Lotes menores para commit mais frequente e feedback rápido
                console.log(`📤 Inserindo ${uniqueRows.length} registros únicos para a categoria: ${cat} (de ${rows.length} totais)...`);

                for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
                    const chunk = uniqueRows.slice(i, i + BATCH_SIZE);
                    const values = [];
                    const params = [];

                    chunk.forEach((row, idx) => {
                        const baseIdx = idx * 10;
                        values.push(`($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, $${baseIdx + 9}, $${baseIdx + 10})`);
                        params.push(
                            cat,
                            row.NOME,
                            row.PRODUTO,
                            row.PRODUTO_COD,
                            row.FORNECEDOR,
                            row.VALOR || 0,
                            String(row.DOCUMENTO || ''),
                            row.DATA_EMISSAO,
                            row.MES,
                            row.ANO
                        );
                    });

                    const query = `
                        INSERT INTO custos_registros (categoria, nome, produto, produto_cod, fornecedor, valor, documento, data_emissao, mes, ano) 
                        VALUES ${values.join(',')}
                        ON CONFLICT (categoria, documento, produto_cod, fornecedor, data_emissao, valor) DO UPDATE SET
                            nome = EXCLUDED.nome,
                            produto = EXCLUDED.produto,
                            valor = EXCLUDED.valor,
                            atualizado_em = CURRENT_TIMESTAMP
                    `;

                    await client.query(query, params);
                    totalInseridos += chunk.length;
                    const pct = ((totalInseridos / totalGeral) * 100).toFixed(0);
                    if (totalInseridos % 200 === 0 || totalInseridos === totalGeral) {
                        process.stdout.write(`@PROG:CUSTOS:${pct}%\n`);
                    }
                }
            };

            await insertBatch('fornecedores', dados.fornecedores);
            await insertBatch('tipos', dados.tipos);
            await insertBatch('setores', dados.setores);
            await insertBatch('materiais', dados.materiais);

            console.log(`\n✨ Sincronização concluída com sucesso! ${totalInseridos} registros totais armazenados.`);

            // ATUALIZAR STATUS DE SINCRONIZAÇÃO
            try {
                await client.query("SET TIME ZONE 'America/Sao_Paulo'");
                await client.query(`
                    INSERT INTO sync_status (screen_name, last_sync_at)
                    VALUES ('Custos', NOW())
                    ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
                `);
                console.log('📊 Status de sincronização atualizado para: Custos');
            } catch (statusErr) {
                console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
            }

        } catch (dbErr) {
            await client.query('ROLLBACK');
            throw dbErr;
        } finally {
            client.release();
        }

    } catch (e) {
        console.error('❌ Erro inesperado durante as transações:', e);
    }
}

syncData()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Finalizou com erro fatal:', err);
        process.exit(1);
    });
