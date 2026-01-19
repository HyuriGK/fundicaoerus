// api/index.js
const express = require('express');
const app = express();

// Middleware para entender JSON
app.use(express.json());

// --- IMPORTAÇÃO DOS ARQUIVOS DA PASTA SRC ---
// Note que estou usando "../src/" para voltar uma pasta e entrar em src
const acabamentoExterno = require('../src/acabamento_externo');
const acabamentoInterno = require('../src/acabamento-interno');
const aderencia = require('../src/aderencia');
const amostra = require('../src/amostra');
const auth = require('../src/auth');
const carteira = require('../src/carteira');
const dureza = require('../src/dureza');
const faturamento = require('../src/faturamento');
const fatDetalhado = require('../src/faturamento-clientes-detalhado');
const metas = require('../src/metas');
const producaoApontada = require('../src/producao-apontada');
const refugo = require('../src/refugo');
const register = require('../src/register');

// --- DEFINIÇÃO DAS ROTAS ---
// Aqui definimos qual URL chama qual arquivo

app.use('/api/acabamento-externo', acabamentoExterno);
app.use('/api/acabamento-interno', acabamentoInterno);
app.use('/api/aderencia', aderencia);
app.use('/api/amostra', amostra);
app.use('/api/auth', auth); // Ex: /api/auth/login
app.use('/api/carteira', carteira);
app.use('/api/dureza', dureza);
app.use('/api/faturamento', faturamento);
app.use('/api/faturamento-detalhado', fatDetalhado);
app.use('/api/metas', metas);
app.use('/api/producao-apontada', producaoApontada);
app.use('/api/refugo', refugo);
app.use('/api/register', register); 

// Rota de teste para ver se a API está de pé
app.get('/api', (req, res) => {
  res.json({ status: 'API Online', version: '1.0.0' });
});

// --- ADICIONE ISTO NO FINAL, ANTES DO EXPORT ---
// Middleware de Tratamento de Erros Global
app.use((err, req, res, next) => {
  console.error("ERRO NO SERVIDOR:", err); // Mostra no terminal/logs da Vercel
  res.status(500).json({ 
    success: false, 
    message: "Erro interno: " + err.message // Envia o motivo do erro para o navegador
  });
});

// Exporta o app para a Vercel rodar
module.exports = app;