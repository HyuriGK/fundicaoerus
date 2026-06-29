require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
const { Firebird, options: FIREBIRD_OPTIONS } = require('../../lib/firebird-helper');
const pool = require('../../lib/db');

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
                centro_custo_codigo INTEGER,
                centro_custo_nome VARCHAR(255),
                centro_custo_mascara VARCHAR(50),
                centro_custo_tipo VARCHAR(20),
                quantidade NUMERIC(15,4),
                atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS produto VARCHAR(255);
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS produto_cod VARCHAR(50);
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS fornecedor VARCHAR(255);
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS centro_custo_codigo INTEGER;
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS centro_custo_nome VARCHAR(255);
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS centro_custo_mascara VARCHAR(50);
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS centro_custo_tipo VARCHAR(20);
            ALTER TABLE custos_registros ADD COLUMN IF NOT EXISTS quantidade NUMERIC(15,4);

            -- REMOVER ÍNDICE PARA PERMITIR LIMPEZA (Se ele existir de uma falha anterior)
            DROP INDEX IF EXISTS idx_custos_unique_upsert;
        `);

        console.log('🛠️ [2/4] Normalizando defaults...');
        await client.query(`
            ALTER TABLE custos_registros ALTER COLUMN documento SET DEFAULT '';
            ALTER TABLE custos_registros ALTER COLUMN produto_cod SET DEFAULT '';
            ALTER TABLE custos_registros ALTER COLUMN fornecedor SET DEFAULT '';
        `);

        console.log('🛠️ [3/4] Modelo truncate habilitado...');
        console.log('Modelo truncate habilitado para a sincronizacao.');

        console.log('🛠️ [4/4] Garantindo índices de consulta...');
        await client.query(`

            CREATE INDEX IF NOT EXISTS idx_custos_registros_mes_ano ON custos_registros(mes, ano);
            CREATE INDEX IF NOT EXISTS idx_custos_registros_categoria ON custos_registros(categoria);
            CREATE INDEX IF NOT EXISTS idx_custos_registros_cc_codigo ON custos_registros(centro_custo_codigo);
            CREATE INDEX IF NOT EXISTS idx_custos_registros_cc_mascara ON custos_registros(centro_custo_mascara);
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
    const dataInicio = new Date(2026, 0, 1);
    const dataFim = new Date(2027, 0, 1);
    const dataInicioStr = dataInicio.toISOString().split('T')[0];
    const dataFimStr = dataFim.toISOString().split('T')[0];
    console.log(`📅 Janela de Sincronização: ${dataInicioStr} até ${dataFimStr}.`);

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
                COALESCE(CC.NOME_CTU, 'SEM CENTRO DE CUSTO') AS NOME,
                COALESCE(PRO.NOME_PRO, CAST(PMV.PRODUTO_PMV AS VARCHAR(50))) AS PRODUTO,
                PMV.PRODUTO_PMV AS PRODUTO_COD,
                'MOVIMENTACAO DE PRODUTO' AS FORNECEDOR,
                (COALESCE(PMV.CUSTO_PMV, 0) * COALESCE(PMV.QUANTIDADE_PMV, 0)) AS VALOR,
                PMV.QUANTIDADE_PMV AS QUANTIDADE,
                PMV.DATA_PMV AS DATA_EMISSAO,
                CAST(PMV.PRODUTO_PMV AS VARCHAR(50)) AS DOCUMENTO,
                EXTRACT(MONTH FROM PMV.DATA_PMV) AS MES,
                EXTRACT(YEAR FROM PMV.DATA_PMV) AS ANO,
                CC.CODIGO_CTU AS CENTRO_CUSTO_CODIGO,
                CC.NOME_CTU AS CENTRO_CUSTO_NOME,
                CC.MASCARA_CTU AS CENTRO_CUSTO_MASCARA,
                CASE
                    WHEN CC.TIPO_MASCARA_CTU = 1 THEN 'SINTETICA'
                    WHEN CC.TIPO_MASCARA_CTU = 0 THEN 'ANALITICA'
                    ELSE NULL
                END AS CENTRO_CUSTO_TIPO
            FROM PRODUTO_MOVIMENTACAO PMV
            LEFT JOIN CENTRO_CUSTO CC ON PMV.CENTRO_CUSTO_PMV = CC.CODIGO_CTU
            LEFT JOIN PRODUTO PRO ON PMV.PRODUTO_PMV = PRO.CODIGO_PRO
            WHERE PMV.EMPRESA_PMV = 1
              AND PMV.OPERACAO_PMV IN (109, 111, 122)
              AND PMV.DATA_PMV >= ?
              AND PMV.DATA_PMV < ?
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
            setores: await fetchFbData(queries.setores, 'Setores', [dataInicio, dataFim]),
            materiais: await fetchFbData(queries.materiais, 'Materiais', [dataInicio])
        };

        dbFb.detach();
        console.log('✅ Extração concluída. Fechando conexão Firebird.');

        const client = await pool.connect();
        try {
            // Chamada de migração para o mestre
            await createTableIfNotExists();
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE custos_registros RESTART IDENTITY');

            const totalGeral = dados.fornecedores.length + dados.tipos.length + dados.setores.length + dados.materiais.length;
            let totalInseridos = 0;

            const insertBatch = async (cat, rows) => {
                const uniqueRows = rows;
                const BATCH_SIZE = 200;
                console.log(`Inserindo ${uniqueRows.length} registros para a categoria: ${cat}...`);

                for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
                    const chunk = uniqueRows.slice(i, i + BATCH_SIZE);
                    const values = [];
                    const params = [];

                    chunk.forEach((row, idx) => {
                        const baseIdx = idx * 15;
                        values.push(`($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, $${baseIdx + 9}, $${baseIdx + 10}, $${baseIdx + 11}, $${baseIdx + 12}, $${baseIdx + 13}, $${baseIdx + 14}, $${baseIdx + 15})`);
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
                            row.ANO,
                            row.CENTRO_CUSTO_CODIGO || null,
                            row.CENTRO_CUSTO_NOME ? String(row.CENTRO_CUSTO_NOME).replace(/\s+/g, ' ').trim() : null,
                            row.CENTRO_CUSTO_MASCARA ? String(row.CENTRO_CUSTO_MASCARA).trim() : null,
                            row.CENTRO_CUSTO_TIPO ? String(row.CENTRO_CUSTO_TIPO).trim() : null,
                            row.QUANTIDADE || null
                        );
                    });

                    const query = `
                        INSERT INTO custos_registros (
                            categoria, nome, produto, produto_cod, fornecedor, valor, documento, data_emissao, mes, ano,
                            centro_custo_codigo, centro_custo_nome, centro_custo_mascara, centro_custo_tipo, quantidade
                        )
                        VALUES ${values.join(',')}
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
            await client.query('COMMIT');

            console.log(`\n✨ Sincronização concluída com sucesso! ${totalInseridos} registros totais armazenados.`);

            // ATUALIZAR STATUS DE SINCRONIZAÇÃO
            try {
                await client.query("SET TIME ZONE 'America/Sao_Paulo'");
                await client.query(`
                    INSERT INTO sync_status (screen_name, last_sync_at)
                    VALUES ('Custos', NOW())
                    ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
                `);
                await client.query(`
                    INSERT INTO sync_status (screen_name, last_sync_at)
                    VALUES ('Centro de Custo', NOW())
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
