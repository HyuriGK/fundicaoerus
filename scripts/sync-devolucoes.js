// scripts/sync-devolucoes.js
// Script de Sincronização de Devoluções: Firebird → PostgreSQL
// Filtra por FINALIDADE_NOT = 4 e anos 2025/2026

const Firebird = require('node-firebird');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

const firebirdOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

function formatarData(data) {
    if (!data) return null;
    const d = new Date(data);
    return d.toISOString().split('T')[0];
}

async function sincronizar() {
    console.log('🚀 Iniciando sincronização de Devoluções...');

    // 1. Criar Tabela no Postgres
    await pool.query(`
        CREATE TABLE IF NOT EXISTS firebird_sync_devolucoes (
            id SERIAL PRIMARY KEY,
            nota_fiscal INTEGER,
            serie VARCHAR(10),
            item_nota INTEGER,
            data_entrada DATE,
            cliente_codigo VARCHAR(20),
            cliente_nome VARCHAR(255),
            codigo_item VARCHAR(50),
            descricao VARCHAR(255),
            quantidade DECIMAL(15,3),
            valor_unitario DECIMAL(15,2),
            valor_total DECIMAL(15,2),
            peso_un DECIMAL(15,3),
            peso_total DECIMAL(15,3),
            motivo TEXT,
            codigo_not INTEGER,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(nota_fiscal, serie, item_nota, codigo_item)
        )
    `);

    // Migração: Adicionar coluna se não existir
    await pool.query('ALTER TABLE firebird_sync_devolucoes ADD COLUMN IF NOT EXISTS codigo_not INTEGER');

    Firebird.attach(firebirdOptions, (err, db) => {
        if (err) {
            console.error('❌ Erro ao conectar ao Firebird:', err);
            process.exit(1);
        }

        const query = `
            SELECT 
                nf.CODIGO_NOT as NOTA_FISCAL,
                nf.SERIE_NOT as SERIE,
                nfp.ITEM_NPR as ITEM_NOTA,
                CAST(nf.DATA_ENT_NOT AS DATE) as DATA_ENTRADA,
                nf.DESTINATARIO_NOT as CLIENTE_CODIGO,
                nf.RAZAO_SOCIAL_NOT as CLIENTE_NOME,
                nfp.PRODUTO_NPR as CODIGO_ITEM,
                nfp.NOME_PRODUTO_NPR as DESCRICAO,
                nfp.QUANTIDADE_NPR as QUANTIDADE,
                nfp.PRECO_NPR as VALOR_UNITARIO,
                CAST(nf.TOTAL_NOT AS DECIMAL(15,2)) / (
                    SELECT COUNT(*) FROM NOTA_FISCAL_PRODUTO nfp2 
                    WHERE nfp2.EMPRESA_NPR = nf.EMPRESA_NOT 
                      AND nfp2.SERIE_NPR = nf.SERIE_NOT 
                      AND nfp2.CODIGO_NPR = nf.CODIGO_NOT
                ) as VALOR_TOTAL,
                p.PESO_LIQUIDO_PRO as PESO_UN,
                (nfp.QUANTIDADE_NPR * COALESCE(p.PESO_LIQUIDO_PRO, 0)) as PESO_TOTAL,
                nf.ADICIONAIS_NOT as MOTIVO,
                nf.CODIGO_NOT
            FROM NOTA_FISCAL nf
            INNER JOIN NOTA_FISCAL_PRODUTO nfp 
                ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
                AND nf.SERIE_NOT = nfp.SERIE_NPR
                AND nf.CODIGO_NOT = nfp.CODIGO_NPR
            LEFT JOIN PRODUTO p
                ON nfp.PRODUTO_NPR = p.CODIGO_PRO
            WHERE nf.FINALIDADE_NOT = 4
                AND nf.DATA_ENT_NOT >= '2025-01-01'
                AND (nfp.QUANTIDADE_NPR * COALESCE(p.PESO_LIQUIDO_PRO, 0)) > 0
            ORDER BY nf.DATA_ENT_NOT DESC
        `;

        db.query(query, async (err, result) => {
            if (err) {
                console.error('❌ Erro na consulta Firebird:', err);
                db.detach();
                process.exit(1);
            }

            console.log(`📦 Encontrados ${result.length} registros de devolução.`);

            try {
                // Limpar dados para reinserir (mantendo simplicidade de sync total para 2025/2026)
                await pool.query('DELETE FROM firebird_sync_devolucoes');

                for (const row of result) {
                    await pool.query(`
                        INSERT INTO firebird_sync_devolucoes (
                            nota_fiscal, serie, item_nota, data_entrada, cliente_codigo, 
                            cliente_nome, codigo_item, descricao, quantidade, valor_unitario, 
                            valor_total, peso_un, peso_total, motivo, codigo_not
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    `, [
                        row.NOTA_FISCAL,
                        row.SERIE ? String(row.SERIE).trim() : '',
                        row.ITEM_NOTA,
                        formatarData(row.DATA_ENTRADA),
                        row.CLIENTE_CODIGO,
                        row.CLIENTE_NOME,
                        row.CODIGO_ITEM,
                        row.DESCRICAO,
                        row.QUANTIDADE,
                        row.VALOR_UNITARIO,
                        row.VALOR_TOTAL,
                        row.PESO_UN,
                        row.PESO_TOTAL,
                        row.MOTIVO,
                        row.CODIGO_NOT
                    ]);
                }

                console.log('✅ Sincronização de devoluções concluída com sucesso!');
            } catch (pgErr) {
                console.error('❌ Erro ao salvar no Postgres:', pgErr);
            } finally {
                db.detach();
                await pool.end();
                process.exit(0);
            }
        });
    });
}

sincronizar();
