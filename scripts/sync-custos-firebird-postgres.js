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
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS custos_registros (
                id SERIAL PRIMARY KEY,
                categoria VARCHAR(50) NOT NULL,
                nome VARCHAR(255) NOT NULL,
                valor NUMERIC(15,2) DEFAULT 0,
                documento VARCHAR(100),
                data_emissao DATE,
                mes INTEGER,
                ano INTEGER,
                atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Índices para performance na API (Filtros e Agrupamentos)
            CREATE INDEX IF NOT EXISTS idx_custos_registros_mes_ano ON custos_registros(mes, ano);
            CREATE INDEX IF NOT EXISTS idx_custos_registros_categoria ON custos_registros(categoria);
        `);
        console.log('✅ Tabela custos_registros verificada/criada no Postgres.');
    } catch (error) {
        console.error('❌ Erro ao criar tabela no Postgres:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function syncData() {
    console.log(`\n🚀 Iniciando sincronização de Custos Granular (Firebird -> Postgres) - ${new Date().toLocaleString()}`);

    await createTableIfNotExists();

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
    const queries = {
        fornecedores: `
            SELECT 
                COALESCE(FORN.RAZAO_SOCIAL_FRN, 'DESCONHECIDO') AS NOME,
                C.TOTAL_PRODUTOS_COM AS VALOR,
                C.EMISSAO_COM AS DATA_EMISSAO,
                C.NUMERO_COM AS DOCUMENTO,
                EXTRACT(MONTH FROM C.EMISSAO_COM) AS MES,
                EXTRACT(YEAR FROM C.EMISSAO_COM) AS ANO
            FROM COMPRA C
            LEFT JOIN FORNECEDOR FORN ON C.FORNECEDOR_COM = FORN.FOR_CODIGO_FRN
            WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026)
        `,
        tipos: `
            SELECT 
                COALESCE(DES.NOME_DES, 'NAO CATEGORIZADO') AS NOME,
                C.TOTAL_PRODUTOS_COM AS VALOR,
                C.EMISSAO_COM AS DATA_EMISSAO,
                C.NUMERO_COM AS DOCUMENTO,
                EXTRACT(MONTH FROM C.EMISSAO_COM) AS MES,
                EXTRACT(YEAR FROM C.EMISSAO_COM) AS ANO
            FROM COMPRA C
            LEFT JOIN DESPESA DES ON C.DESPESA_COM = DES.CODIGO_DES
            WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026) AND DES.NOME_DES IS NOT NULL
        `,
        setores: `
            SELECT 
                COALESCE(CC.NOME_CTU, 'GERAL / NAO ALOCADO') AS NOME,
                PAG.VALOR_PARCELA_PAG AS VALOR,
                PAG.DATA_EMISSAO_PAG AS DATA_EMISSAO,
                PAG.DOCUMENTO_PAG AS DOCUMENTO,
                PAG.MES_PAG AS MES,
                PAG.ANO_PAG AS ANO
            FROM PAGAR PAG
            LEFT JOIN CENTRO_CUSTO CC ON PAG.CTU_CODIGO_PAG = CC.CODIGO_CTU
            WHERE PAG.ANO_PAG IN (2025, 2026)
        `,
        materiais: `
            SELECT 
                COALESCE(PRO.NOME_PRO, 'DIVERSOS') AS NOME,
                CP.VALOR_PRODUTOS_CPR AS VALOR,
                C.EMISSAO_COM AS DATA_EMISSAO,
                C.NUMERO_COM AS DOCUMENTO,
                EXTRACT(MONTH FROM C.EMISSAO_COM) AS MES,
                EXTRACT(YEAR FROM C.EMISSAO_COM) AS ANO
            FROM COMPRA_PRODUTO CP
            JOIN COMPRA C ON CP.COM_ID_CPR = C.ID_COM
            LEFT JOIN PRODUTO PRO ON CP.PRODUTO_CPR = PRO.CODIGO_PRO
            WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026)
        `
    };

    const fetchFbData = (q, name) => {
        return new Promise((resolve) => {
            dbFb.query(q, (err, res) => {
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
            fornecedores: await fetchFbData(queries.fornecedores, 'Fornecedores'),
            tipos: await fetchFbData(queries.tipos, 'Tipos'),
            setores: await fetchFbData(queries.setores, 'Setores'),
            materiais: await fetchFbData(queries.materiais, 'Materiais')
        };

        dbFb.detach();
        console.log('✅ Extração concluída. Fechando conexão Firebird.');

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Limpa os registros do cache
            await client.query('TRUNCATE TABLE custos_registros');

            let inseridos = 0;

            const insertRow = async (cat, row) => {
                const valor = row.VALOR || 0;
                // Formatação robusta para lidar com os tipos buffer/date do array retornados pela query nativa.
                await client.query(`
                    INSERT INTO custos_registros (categoria, nome, valor, documento, data_emissao, mes, ano) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [cat, row.NOME, valor, String(row.DOCUMENTO || ''), row.DATA_EMISSAO, row.MES, row.ANO]);
                inseridos++;
            };

            for (const row of dados.fornecedores) await insertRow('fornecedores', row);
            for (const row of dados.tipos) await insertRow('tipos', row);
            for (const row of dados.setores) await insertRow('setores', row);
            for (const row of dados.materiais) await insertRow('materiais', row);

            await client.query('COMMIT');
            console.log(`✅ Sincronização concluída com sucesso! ${inseridos} tickets armazenados no Postgres.`);

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
