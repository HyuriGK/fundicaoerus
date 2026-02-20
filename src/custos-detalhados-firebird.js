const express = require('express');
const router = express.Router();
const pool = require('../lib/db'); // Alterado para buscar diretamente no Postgres

// GET /api/custos-detalhados
// Retorna os custos do banco de dados relacional sincronizado.
router.get('/', async (req, res) => {
    try {
        console.log('📊 [API] Recebida requisição para detalhamento de Custos (Postgres).');

        const { rows } = await pool.query(`
            SELECT categoria, nome, total 
            FROM custos_detalhados
        `);

        // Extrai as categorias do pool de linhas
        const fetchCategory = (categoryName) => {
            return rows
                .filter(r => r.categoria === categoryName)
                .map(r => ({ nome: r.nome, total: Number(r.total) || 0 }));
        }

        res.json({
            success: true,
            data: {
                fornecedores: fetchCategory('fornecedores'),
                tipos: fetchCategory('tipos'),
                setores: fetchCategory('setores'),
                materiais: fetchCategory('materiais')
            }
        });

    } catch (error) {
        console.error('❌ [API Custos] Erro ao buscar custos detalhados no Postgres:', error);
        res.status(500).json({ success: false, error: 'Erro interno no servidor ao buscar dados de custos.' });
    }
});

module.exports = router;
