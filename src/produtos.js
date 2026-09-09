const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

async function ensureTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync (
            codigo TEXT PRIMARY KEY, empresa INTEGER, nome TEXT, apelido TEXT, nome_tecnico TEXT,
            cliente_codigo TEXT, cliente_nome TEXT, grupo TEXT, subgrupo TEXT, divisao TEXT,
            situacao TEXT, tipo TEXT, unidade TEXT, unidade_producao TEXT,
            data_cadastro DATE, atualizado_origem TIMESTAMPTZ, peso_liquido NUMERIC, peso_bruto NUMERIC,
            ncm TEXT, ipi NUMERIC, custo_medio NUMERIC, custo_compra NUMERIC, custo_sem_impostos NUMERIC,
            preco_venda NUMERIC, preco_venda_2 NUMERIC, preco_venda_3 NUMERIC, observacao TEXT,
            observacao_fiscal TEXT, dados JSONB NOT NULL DEFAULT '{}'::jsonb, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync_materiais (
            produto_codigo TEXT PRIMARY KEY REFERENCES produtos_firebird_sync(codigo) ON DELETE CASCADE,
            material_id TEXT, material TEXT, lote TEXT, modelo TEXT, processo TEXT, local TEXT,
            peso_estimado NUMERIC, contracao NUMERIC, dureza_min NUMERIC, dureza_max NUMERIC,
            observacao TEXT, documento TEXT, revisao TEXT, composicao JSONB NOT NULL DEFAULT '[]'::jsonb,
            propriedades JSONB NOT NULL DEFAULT '{}'::jsonb, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync_fotos (
            produto_codigo TEXT NOT NULL REFERENCES produtos_firebird_sync(codigo) ON DELETE CASCADE,
            ordem INTEGER NOT NULL DEFAULT 0, principal BOOLEAN NOT NULL DEFAULT FALSE, foto_base64 TEXT NOT NULL,
            synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (produto_codigo, ordem)
        );
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync_fornecedores (
            produto_codigo TEXT NOT NULL REFERENCES produtos_firebird_sync(codigo) ON DELETE CASCADE,
            fornecedor_codigo TEXT NOT NULL, fornecedor_nome TEXT, codigo_produto_fornecedor TEXT,
            principal BOOLEAN NOT NULL DEFAULT FALSE, emissao_oc BOOLEAN NOT NULL DEFAULT FALSE,
            preco_unitario NUMERIC, observacao TEXT, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (produto_codigo, fornecedor_codigo, codigo_produto_fornecedor)
        );
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync_custos (
            id_origem TEXT PRIMARY KEY, produto_codigo TEXT NOT NULL REFERENCES produtos_firebird_sync(codigo) ON DELETE CASCADE,
            data DATE, hora TEXT, custo_anterior NUMERIC, custo_novo NUMERIC, usuario TEXT, observacao TEXT,
            synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS produtos_firebird_sync_medidas (
            produto_codigo TEXT PRIMARY KEY REFERENCES produtos_firebird_sync(codigo) ON DELETE CASCADE,
            dados JSONB NOT NULL DEFAULT '{}'::jsonb, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

router.get('/', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json({ produtos: [] });
    try {
        await ensureTables();
        const { rows } = await pool.query(`
            SELECT codigo, nome, apelido, cliente_nome, grupo, subgrupo, situacao, unidade, peso_liquido,
                (SELECT foto_base64 FROM produtos_firebird_sync_fotos f WHERE f.produto_codigo=p.codigo ORDER BY principal DESC, ordem LIMIT 1) AS foto
            FROM produtos_firebird_sync p
            WHERE codigo ILIKE $1 OR nome ILIKE $1 OR coalesce(apelido,'') ILIKE $1
            ORDER BY CASE WHEN codigo ILIKE $2 THEN 0 ELSE 1 END, nome LIMIT 20
        `, [`%${query}%`, `${query}%`]);
        res.json({ produtos: rows });
    } catch (error) {
        console.error('Erro ao pesquisar produtos:', error.message);
        res.status(500).json({ error: 'Não foi possível pesquisar os produtos sincronizados.' });
    }
});

router.get('/:codigo', async (req, res) => {
    try {
        await ensureTables();
        const { rows } = await pool.query('SELECT * FROM produtos_firebird_sync WHERE codigo=$1 LIMIT 1', [req.params.codigo]);
        const produto = rows[0];
        if (!produto) return res.status(404).json({ error: 'Produto não encontrado. Execute a sincronização para atualizar a base.' });
        const [material, fotos, fornecedores, custos, medidas] = await Promise.all([
            pool.query('SELECT * FROM produtos_firebird_sync_materiais WHERE produto_codigo=$1', [produto.codigo]),
            pool.query('SELECT ordem, principal, foto_base64 FROM produtos_firebird_sync_fotos WHERE produto_codigo=$1 ORDER BY principal DESC, ordem', [produto.codigo]),
            pool.query('SELECT * FROM produtos_firebird_sync_fornecedores WHERE produto_codigo=$1 ORDER BY principal DESC, fornecedor_nome', [produto.codigo]),
            pool.query('SELECT * FROM produtos_firebird_sync_custos WHERE produto_codigo=$1 ORDER BY data DESC, hora DESC', [produto.codigo]),
            pool.query('SELECT dados FROM produtos_firebird_sync_medidas WHERE produto_codigo=$1', [produto.codigo])
        ]);
        res.json({ produto, material: material.rows[0] || null, fotos: fotos.rows, fornecedores: fornecedores.rows, custos: custos.rows, medidas: medidas.rows[0]?.dados || {} });
    } catch (error) {
        console.error('Erro ao consultar produto:', error.message);
        res.status(500).json({ error: 'Não foi possível carregar o produto.' });
    }
});

module.exports = router;
