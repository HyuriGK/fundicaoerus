const fs = require('fs');
const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Add tooltips to Chart.js
content = content.replace(
    /label: \(ctx\) => `Faturamento: \${ctx\.parsed\.y\.toFixed\(2\)} Ton`/g,
    "label: (ctx) => `Faturamento: ${ctx.parsed.y.toFixed(2)} Ton`, afterBody: () => ['', '🖱 Clique esquerdo para ver os registros']"
);

content = content.replace(
    /label: \(ctx\) => ` Peso: \${ctx\.parsed\.toLocaleString\('pt-BR'\)} kg`/g,
    "label: (ctx) => ` Peso: ${ctx.parsed.toLocaleString('pt-BR')} kg`, afterBody: () => ['', '🖱 Clique esquerdo para ver os registros']"
);

// 2. Add titles to KPI cards
content = content.replace(
    'id="live-carteira-peso"',
    'id="live-carteira-peso" title="Clique esquerdo para ver os registros"'
);
content = content.replace(
    'id="live-faturamento"',
    'id="live-faturamento" title="Clique esquerdo para ver os registros"'
);
content = content.replace(
    'id="live-meta"',
    'id="live-meta" title="Clique esquerdo para ver os registros"'
);
content = content.replace(
    'id="live-refugo"',
    'id="live-refugo" title="Clique esquerdo para ver os registros"'
);

fs.writeFileSync(path, content);
console.log('index.html updated successfully');
