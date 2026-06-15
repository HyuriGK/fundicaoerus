var f=require("fs");
var h = f.readFileSync("public/refugos.html","utf8");

// Check what line endings we have
var crlf = h.indexOf("\r\n") > -1;
if (crlf) h = h.replace(/\r\n/g, "\n");

// === 1. KPI: Add "Valor Refugado" card before "Refugo Total" ===
var kpiTarget = '<div class="kpi-card">\n                    <div class="kpi-title">Refugo Total</div>';
var kpiReplace = '<div class="kpi-card" onclick="toggleValorRef()" style="cursor:pointer;">\n                    <div class="kpi-title">Valor Refugado</div>\n                    <div class="kpi-value" style="display:flex;align-items:center;gap:6px;">\n                        <i id="valorRefEye" class="fa-solid fa-eye" style="font-size:0.8rem;opacity:0.5;"></i>\n                        <span id="kpiValorRef" data-real-value="R$ 0,00">R$ 0,00</span>\n                    </div>\n                </div>\n                <div class="kpi-card">\n                    <div class="kpi-title">Refugo Total</div>';
if (h.indexOf(kpiTarget) > -1) {
    h = h.replace(kpiTarget, kpiReplace);
    console.log("1. KPI card added");
} else {
    console.log("1. SKIP - KPI already added or target not found");
}

// === 2. Table: Add columns in main dataTable only ===
// Find the dataTable (not detailDataTable) header section
var dtIdx = h.indexOf('<table id="dataTable">');
if (dtIdx > -1) {
    var dtEnd = h.indexOf('</thead>', dtIdx);
    var dtSection = h.substring(dtIdx, dtEnd);
    
    if (dtSection.indexOf('Valor Un') === -1) {
        // Add column headers
        dtSection = dtSection.replace(
            '<th style="text-align: center;">Peso Total</th>',
            '<th style="text-align: center;">Peso Total</th>\n                            <th style="text-align: center;">Valor Un (R$)</th>\n                            <th style="text-align: center;">Valor Total (R$)</th>'
        );
        // Add filter inputs (2 more)
        dtSection = dtSection.replace(
            '<th><input class="filter-input-table" onkeyup="filterTable()" placeholder="..."></th>\n                        </tr>\n                    </thead>',
            '<th><input class="filter-input-table" onkeyup="filterTable()" placeholder="..."></th>\n                            <th><input class="filter-input-table" onkeyup="filterTable()" placeholder="..."></th>\n                        </tr>\n                    </thead>'
        );
        h = h.substring(0, dtIdx) + dtSection + h.substring(dtEnd);
        console.log("2. Table columns added");
    } else {
        console.log("2. SKIP - columns already present");
    }
}

// === 3. Row template: Add cells ===
var rowTarget = '<td style="text-align: center;">${parseFloat(r.peso_total).toLocaleString(\'pt-BR\', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>\n                    </tr>';
var rowReplace = '<td style="text-align: center;">${parseFloat(r.peso_total).toLocaleString(\'pt-BR\', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>\n                        <td style="text-align: center; color: var(--color-primary);">R$ ${parseFloat(r.valor_unitario || 0).toLocaleString(\'pt-BR\', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>\n                        <td style="text-align: center; color: var(--status-info);">R$ ${(parseFloat(r.valor_unitario || 0) * parseFloat(r.quantidade || 0)).toLocaleString(\'pt-BR\', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>\n                    </tr>';
if (h.indexOf(rowTarget) > -1 && h.indexOf('Valor Un') > -1) {
    h = h.replace(rowTarget, rowReplace);
    console.log("3. Row cells added");
} else {
    console.log("3. SKIP - cells already present or target not found");
}

// === 4. Toggle function ===
if (h.indexOf('function toggleValorRef') === -1) {
    h = h.replace(
        'function processData() {',
        'function toggleValorRef() {\n            var el = document.getElementById(\'kpiValorRef\');\n            var icon = document.getElementById(\'valorRefEye\');\n            var vis = el.getAttribute(\'data-visible\') !== \'false\';\n            el.setAttribute(\'data-visible\', vis ? \'false\' : \'true\');\n            el.textContent = vis ? \'R$ -----\' : el.getAttribute(\'data-real-value\') || \'R$ 0,00\';\n            icon.className = vis ? \'fa-solid fa-eye-slash\' : \'fa-solid fa-eye\';\n        }\n        function processData() {'
    );
    console.log("4. Toggle function added");
} else {
    console.log("4. SKIP - toggle already present");
}

// === 5. Calculation ===
if (h.indexOf('totalValorRefugo') === -1) {
    h = h.replace(
        'const totalRefugo = filteredData.reduce((acc, curr) => acc + parseFloat(curr.peso_total || 0), 0);',
        'const totalRefugo = filteredData.reduce((acc, curr) => acc + parseFloat(curr.peso_total || 0), 0);\n            const totalValorRefugo = filteredData.reduce((acc, curr) => acc + (parseFloat(curr.valor_unitario || 0) * parseFloat(curr.quantidade || 0)), 0);'
    );
    console.log("5. Calculation added");
} else {
    console.log("5. SKIP - calculation already present");
}

// === 6. KPI display ===
if (h.indexOf('kpiValorRef') > -1 && h.indexOf('data-real-value') > -1) {
    var displayTarget = "document.getElementById('kpiRefugoTotal').textContent = totalRefugo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' kg';";
    var displayReplace = "document.getElementById('kpiRefugoTotal').textContent = totalRefugo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' kg';\n            var kpiValorEl = document.getElementById('kpiValorRef');\n            kpiValorEl.setAttribute('data-real-value', 'R$ ' + totalValorRefugo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));\n            if (kpiValorEl.getAttribute('data-visible') !== 'false') kpiValorEl.textContent = 'R$ ' + totalValorRefugo.toLocaleString('pt-BR', { minimumFractionDigits: 2 });";
    if (h.indexOf('kpiValorEl') === -1) {
        h = h.replace(displayTarget, displayReplace);
        console.log("6. KPI display added");
    } else {
        console.log("6. SKIP - display already present");
    }
}

// === 7. Modal footer ===
if (h.indexOf('tableTotalValue') === -1) {
    h = h.replace(
        'id="tableTotalWeight">0.00 kg</b></div>',
        'id="tableTotalWeight">0.00 kg</b></div>\n                                <span style="margin-left: 15px; color: var(--text-muted);">Valor Total:</span>\n                                <b id="tableTotalValue" style="color: var(--color-primary); margin-left: 5px;">R$ 0,00</b></div>'
    );
    console.log("7. Modal footer added");
} else {
    console.log("7. SKIP - footer already present");
}

// === 8. updateTableTotals ===
if (h.indexOf('totalValue') === -1) {
    h = h.replace(
        "document.getElementById('tableTotalWeight').textContent = totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';",
        "document.getElementById('tableTotalWeight').textContent = totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';\n                var totalValue = 0;\n                rows.forEach(function(row) {\n                    if (row.style.display !== 'none' && row.cells[13]) {\n                        totalValue += parseFloat(row.cells[13].textContent.replace('R$', '').replace(/\\./g, '').replace(',', '.').trim()) || 0;\n                    }\n                });\n                var valEl = document.getElementById('tableTotalValue');\n                if (valEl) valEl.textContent = 'R$ ' + totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 });"
    );
    console.log("8. updateTableTotals updated");
} else {
    console.log("8. SKIP - already updated");
}

// Restore CRLF
if (crlf) h = h.replace(/\n/g, "\r\n");

f.writeFileSync("public/refugos.html", h);

// Final verify
var c = f.readFileSync("public/refugos.html","utf8");
console.log("\n=== FINAL VERIFY ===");
console.log("processData:", (c.match(/function processData/g)||[]).length);
console.log("toggleValorRef:", (c.match(/function toggleValorRef/g)||[]).length);
console.log("kpiValorRef:", c.indexOf("kpiValorRef") > -1);
console.log("Valor Un:", c.indexOf("Valor Un (R$)") > -1);
console.log("tableTotalValue:", c.indexOf("tableTotalValue") > -1);
console.log("totalValorRefugo:", c.indexOf("totalValorRefugo") > -1);
