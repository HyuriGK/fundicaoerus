const fs = require('fs');
const path = 'public/pedidos.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Standardize KPI titles
const kpiTitles = [
    { from: 'title="Clique para ver todos os registros"', to: 'title="Clique esquerdo para ver os registros"' },
    { from: 'title="Clique para ver os registros liberados"', to: 'title="Clique esquerdo para ver os registros"' },
    { from: 'title="Clique para ver os registros bloqueados"', to: 'title="Clique esquerdo para ver os registros"' }
];

kpiTitles.forEach(t => {
    content = content.split(t.from).join(t.to);
});

// 2. Add afterBody to all tooltips in pedidos.html
// This is trickier because there are multiple Chart objects.
// I'll search for 'tooltip: {' and add 'callbacks: { afterBody: ... }' if not present, or append to existing callbacks.

// Define the observation string
const observation = "afterBody: () => ['', '🖱 Clique esquerdo para ver os registros']";

// Simple regex to find tooltip config and inject afterBody
// Note: This is a bit risky but we are in a scratch script and can verify.
// I'll target specific chart configurations.

// chartPCP, chartPareto, chartPending, chartHistorical
const chartConfigs = ['chartPCP', 'chartPareto', 'chartPending', 'chartHistorical', 'industrialHistoryChart'];

// For bar charts in this file, they usually have a tooltip section.
// I'll look for sections like:
/*
tooltip: {
    ...
}
*/

// Let's use a more targeted replacement for each chart if possible.
// Actually, I'll just look for 'label: (ctx) =>' and add it after.

content = content.replace(
    /label: \(ctx\) => ` \${ctx\.parsed\.y\.toLocaleString\('pt-BR', { minimumFractionDigits: 2 }\)} kg`/g,
    "label: (ctx) => ` ${ctx.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`, afterBody: () => ['', '🖱 Clique esquerdo para ver os registros']"
);

// industrialHistoryChart has a simple tooltip
content = content.replace(
    /boxPadding: 6\s+}/g,
    "boxPadding: 6, callbacks: { afterBody: () => ['', '🖱 Clique esquerdo para ver os registros'] } }"
);

fs.writeFileSync(path, content);
console.log('pedidos.html updated successfully');
