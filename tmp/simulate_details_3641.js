const sectorGroups = {
    'MOLDAGEM': ['MOLDAGEM', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA', 'MOLDAGEM LEVE', 'MOLDAGEM MECANIZADA', 'MOLDAGEM AUTOMÁTICA', 'MOLDAGEM EM AREIA'],
    'FUSÃO': ['FUSÃO', 'FUSAO', 'FUNDICAO', 'FUNDIÇÃO'],
    'ACABAMENTO': ['ACABAMENTO', 'REBARBAÇÃO', 'REBARBACAO', 'GRALHA', 'SUBSTITUICAO', 'RETRABALHO DE ACABAMENTO'],
    'TRATAMENTO TÉRMICO': ['TRATAMENTO TÉRMICO', 'TRATAMENTO TERMICO', 'NORMALIZACAO', 'NORMALIZAÇÃO', 'TEMPERA', 'TÊMPERA', 'REVENIMENTO', 'SOLUBILIZAÇAO', 'SOLUBILIZAÇÃO', 'PARTICULA MAGNETICA DEPOIS TEMPERA', 'RETORNO TEMPERA EXTERNA'],
    'USINAGEM': ['USINAGEM', 'TORNEARIA', 'RETORNO USINAGEM', 'SERVICO DE USINAGEM', 'SERVIÇO DE USINAGEM'],
    'INSPEÇÃO DE QUALIDADE': ['INSPEÇÃO DE QUALIDADE', 'INSPECAO DE QUALIDADE', 'QUALIDADE', 'REVISÃO', 'PRODUZIDA / INSPECIONADO'],
    'EXPEDIÇÃO': ['EXPEDIÇÃO', 'EXPEDICAO', 'LOGÍSTICA']
};

const pointingData = [
  { "setor": "ACABAMENTO", "quantidade": 18 },
  { "setor": "EXPEDICAO", "quantidade": 18 },
  { "setor": "FATURAMENTO", "quantidade": 12 },
  { "setor": "FUSAO", "quantidade": 19 },
  { "setor": "MOLDAGEM PESADA", "quantidade": 20 },
  { "setor": "TRATAMENTO TERMICO", "quantidade": 18 }
];

const allGroups = Object.keys(sectorGroups);
const aggregatedData = {};
allGroups.forEach(s => aggregatedData[s] = 0);

pointingData.forEach(row => {
    const category = allGroups.find(cat =>
        sectorGroups[cat].some(sub => row.setor.toUpperCase().includes(sub.toUpperCase())) || row.setor.toUpperCase() === cat.toUpperCase()
    );
    console.log(`Row: ${row.setor} -> Category: ${category || 'NONE'}`);
    if (category) {
        aggregatedData[category] += row.quantidade;
    }
});

console.log("\nFinal Aggregation:");
console.log(JSON.stringify(aggregatedData, null, 2));
