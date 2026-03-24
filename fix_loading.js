const fs = require('fs');
const path = 'c:/Users/brasi/Desktop/server/public/pedidos.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Wrap Chart defaults in try-catch (Avoid CDN fail crash)
content = content.replace("Chart.defaults.color = '#a1a1aa';", "try { Chart.defaults.color = '#a1a1aa';");
content = content.replace("Chart.defaults.font.family = \"'JetBrains Mono', monospace\";", "Chart.defaults.font.family = \"'JetBrains Mono', monospace\"; } catch(e) { console.warn('Chart.js fail', e); }");

// 2. Add safety timeout to hideLoadingScreen just in case
const hideLoadingDef = "function hideLoadingScreen() {";
content = content.replace(hideLoadingDef, hideLoadingDef + "\n            console.log('Hiding loading screen...');");

// 3. Robust loadDataFromServer
const loadDataPattern = /async function loadDataFromServer\(\) \{[\s\S]*?finally \{[\s\S]*?hideLoadingScreen\(\);[\s\S]*?\}[\s\S]*?\}/;
const newLoadData = `async function loadDataFromServer() {
            try {
                // Safety net: Hide loading after a while anyway
                setTimeout(() => hideLoadingScreen(), 8000);

                // 1. Fetch Custom Weights
                try {
                    const wRes = await fetch('/api/weights/list');
                    if (wRes.ok) customWeights = await wRes.json();
                } catch (err) { console.warn('Falha ao carregar pesos customizados', err); }

                // 2. Fetch Pedidos AND Carteira in parallel
                const [resPedidos, resCarteira] = await Promise.all([
                    fetch('/api/pedidos-sync'),
                    fetch('/api/carteira').catch(e => ({ok: false}))
                ]);

                if (!resPedidos.ok) throw new Error('Erro na API Pedidos');
                allData = await resPedidos.json();

                if (resCarteira.ok) {
                    carteiraData = await resCarteira.json();
                }

                // Apply filters immediately to respect "isModelosHidden" default
                applyColumnFilters();

                // Populate material suggestions for autocomplete
                populateMaterialSuggestions();
            } catch (e) {
                console.error(e);
                if (typeof showToast === 'function') showToast("Erro", "Falha ao carregar dados: " + e.message, "danger");
            } finally {
                hideLoadingScreen();
            }
        }`;
content = content.replace(loadDataPattern, newLoadData);

// 4. Robust DOMContentLoaded
const domContentPattern = /document\.addEventListener\('DOMContentLoaded', async \(\) => \{[\s\S]*?\}\);/;
const newDomContent = `document.addEventListener('DOMContentLoaded', async () => {
            try {
                // Safety net for the whole process
                setTimeout(() => { if (typeof hideLoadingScreen === 'function') hideLoadingScreen(); }, 12000);

                if (typeof setupFilters === 'function') setupFilters();
                await loadDataFromServer();
            } catch (err) {
                console.error("Erro Crítico na Inicialização:", err);
                if (typeof showToast === 'function') showToast("Erro", "Falha ao inicializar sistema.", "danger");
                if (typeof hideLoadingScreen === 'function') hideLoadingScreen();
            }
        });`;
content = content.replace(domContentPattern, newDomContent);

fs.writeFileSync(path, content);
console.log('Repair completed');
