const { Firebird, attachWithRetry } = require('../lib/firebird-helper');
const pool = require('../lib/db');

async function syncRefugos() {
    console.log('🚀 Iniciando sincronização de REFUGOS (Histórico 90 dias)...');

    try {
        const syncStartTime = new Date();
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - 90);
        const dataInicioStr = dataInicio.toISOString().split('T')[0];

        await pool.query(`
            CREATE TABLE IF NOT EXISTS refugos_sincronizados (
                id SERIAL PRIMARY KEY,
                chave_origem VARCHAR(255) UNIQUE NOT NULL,
                data_refugo TIMESTAMP NOT NULL,
                setor VARCHAR(100),
                produto VARCHAR(255),
                motivo VARCHAR(255),
                op VARCHAR(50),
                quantidade NUMERIC(10,2),
                peso_total NUMERIC(10,2),
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_refugos_data ON refugos_sincronizados(data_refugo);
        `);

        // 2. Conectar ao Firebird com Retry
        const db = await attachWithRetry();
        console.log('✅ Conectado ao Firebird com sucesso.');
        console.log(`📅 Janela de Sincronização: ${dataInicioStr} até hoje.`);

        const query = `
            SELECT 
                PCS.CODIGO_PCS AS CODIGO_REF,
                PCS.DATA_PCS AS DATA_REF,
                S.NOME_SET AS SETOR,
                P.NOME_PRO AS PRODUTO,
                R.NOME_REF AS MOTIVO,
                PCS.QUANTIDADE_REFUGO_PCS AS QUANTIDADE,
                PCS.QUANTIDADE_REFUGO_PCS * COALESCE(P.PESO_LIQUIDO_PRO, 0) AS PESO_TOTAL,
                PCS.DOCUMENTO_PCS AS OP
            FROM PRODUCAO_SETOR PCS
            LEFT JOIN SETOR S ON PCS.SETOR_PCS = S.CODIGO_SET
            LEFT JOIN PRODUCAO_SETOR_PECA PCSP ON PCS.CODIGO_PCS = PCSP.PCS_ID_CODIGO_PCSP
            LEFT JOIN PRODUTO P ON PCSP.PRO_CODIGO_PCSP = P.CODIGO_PRO
            LEFT JOIN REFUGO R ON PCS.REF_CODIGO_PCS = R.CODIGO_REF
            WHERE PCS.QUANTIDADE_REFUGO_PCS > 0
              AND PCS.DATA_PCS >= '${dataInicioStr}'
            ORDER BY PCS.DATA_PCS DESC
        `;

        const result = await new Promise((resolve, reject) => {
            db.query(query, [], (err, res) => {
                if (err) reject(err);
                else resolve(res || []);
            });
        });

        console.log(`📦 Encontrados ${result.length} registros de refugos no Firebird.`);

        let inserted = 0;
        for (const row of result) {
            const chaveOrigem = `REF-${row.CODIGO_REF}`;
            await pool.query(`
                INSERT INTO refugos_sincronizados 
                    (chave_origem, data_refugo, setor, produto, motivo, op, quantidade, peso_total, atualizado_em)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                ON CONFLICT (chave_origem) DO UPDATE SET
                    data_refugo = EXCLUDED.data_refugo,
                    setor = EXCLUDED.setor,
                    produto = EXCLUDED.produto,
                    motivo = EXCLUDED.motivo,
                    op = EXCLUDED.op,
                    quantidade = EXCLUDED.quantidade,
                    peso_total = EXCLUDED.peso_total,
                    atualizado_em = CURRENT_TIMESTAMP
            `, [
                chaveOrigem, row.DATA_REF, 
                row.SETOR ? String(row.SETOR).trim() : 'DESCONHECIDO', 
                row.PRODUTO ? String(row.PRODUTO).trim() : 'PRODUTO INDEFINIDO', 
                row.MOTIVO ? String(row.MOTIVO).trim() : 'N/A', 
                row.OP ? String(row.OP).trim() : null,
                parseFloat(row.QUANTIDADE || 0),
                parseFloat(row.PESO_TOTAL || 0)
            ]);

            inserted++;
            if (inserted % 50 === 0 || inserted === result.length) {
                const pct = ((inserted / result.length) * 100).toFixed(0);
                process.stdout.write(`@PROG:REFUGOS:${pct}%\n`);
            }
        }

        // ATUALIZAR STATUS DE SINCRONIZAÇÃO
        try {
            await pool.query("SET TIME ZONE 'America/Sao_Paulo'");
            await pool.query(`
                INSERT INTO sync_status (screen_name, last_sync_at)
                VALUES ('Refugos', NOW())
                ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
            `);
            console.log('📊 Status de sincronização atualizado para: Refugos');
        } catch (statusErr) {
            console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
        }

        db.detach();
        console.log('✅ Sincronização de refugos finalizada com sucesso.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro crítico na sincronização de refugos:', error);
        process.exit(1);
    }
}

syncRefugos();
