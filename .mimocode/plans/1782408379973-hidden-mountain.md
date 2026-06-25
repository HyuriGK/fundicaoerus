# Plano: Seletor de Vendedor no Faturamentos

## [S1] Problemo
O usuário quer filtrar os dados de faturamento por vendedor específico, atualizando os KPIs e gráficos.

## [S2] Dados disponíveis
- `allData` contém registros com campos `vendedorNome` e `vendedorCodigo`
- Os dados já são carregados via `/api/faturamento-postgres/detalhado`
- Filtros existentes: período (data), clientes excluídos, toggle serviços

## [S3] Localização do seletor
Adicionar um `<select>` na toolbar-row (linha 1126-1147), após o seletor de mês e antes dos botões de navegação.

## [S4] Implementação

### HTML (linha ~1131)
```html
<select id="dashboardVendorSelect" class="year-select" style="width:160px !important;" onchange="changeDashboardVendor()">
    <option value="">TODOS OS VENDEDORES</option>
</select>
```

### JavaScript

1. **Variável de estado** (linha ~1263):
```js
let selectedVendor = '';
```

2. **Popular o select** - extrair vendedores únicos de `allData` após load:
```js
function populateVendorSelect() {
    const sel = document.getElementById('dashboardVendorSelect');
    const vendors = [...new Set(allData.map(i => i.vendedorNome).filter(Boolean))].sort();
    // manter option "TODOS", recriar opções
    sel.innerHTML = '<option value="">TODOS OS VENDEDORES</option>';
    vendors.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        sel.appendChild(opt);
    });
}
```

3. **Handler** `changeDashboardVendor()`:
```js
function changeDashboardVendor() {
    selectedVendor = document.getElementById('dashboardVendorSelect').value;
    const dataToUse = hasActiveModalFilters() ? getModalFilteredData() : allData;
    updateDashboardfromRecords(dataToUse);
}
```

4. **Filtrar por vendedor** em `updateDashboardfromRecords()` - adicionar filtro em todas as variáveis `dataToSum`, `rangeData`, `filteredAll`, `dailyContextData` etc:
```js
const vendorFilter = item => !selectedVendor || item.vendedorNome === selectedVendor;
```
E aplicar `.filter(vendorFilter)` nos filtros relevantes.

5. **Chamar `populateVendorSelect()`** dentro de `loadRecordsData()` após `allData` ser preenchido.

## [S5] CSS
Usar a classe `.year-select` existente com `width:160px` para o select de vendedor (maior que year-select padrão para caber nomes).

## [S6] Verificação
- Abrir faturamentos.html
- Seletor de vendedor aparece na toolbar
- Selecionar um vendedor filtra KPIs e gráficos
- "TODOS OS VENDEDORES" mostra dados completos
- Combinar com filtro de mês/ano funciona corretamente
