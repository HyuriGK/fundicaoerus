(() => {
  const search = document.getElementById('productSearch');
  const grid = document.getElementById('productsGrid');
  const status = document.getElementById('productsResultStatus');
  const count = document.getElementById('productsResultCount');
  const dialog = document.getElementById('productDialog');
  const modalLoading = document.getElementById('productModalLoading');
  const modalContent = document.getElementById('productModalContent');
  const panels = document.getElementById('productPanels');
  let timer;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const text = value => value === null || value === undefined || value === '' ? '—' : esc(value);
  const num = value => value === null || value === undefined || value === '' ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(Number(value));
  const money = value => value === null || value === undefined || value === '' ? '—' : new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(value));
  const date = value => {
    if (!value) return '—';
    const raw = String(value);
    const parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? esc(raw) : new Intl.DateTimeFormat('pt-BR').format(parsed);
  };
  const field = (label, value, size = '') => `<div class="info-field ${size}"><label>${esc(label)}</label><strong title="${String(value ?? '').replace(/"/g, '&quot;')}">${text(value)}</strong></div>`;
  const empty = message => `<div class="empty-tab">${esc(message)}</div>`;

  async function request(url) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível consultar os produtos.');
    return data;
  }

  function renderResults(products) {
    grid.innerHTML = products.map(product => {
      const image = product.foto ? `<img src="${product.foto}" alt="">` : '<i class="fa-solid fa-cube"></i>';
      return `<button class="product-card" type="button" data-code="${esc(product.codigo)}"><span class="product-thumb">${image}</span><span class="product-card-copy"><span class="product-code">${text(product.codigo)}</span><span class="product-name">${text(product.nome)}</span><span class="product-meta">${text(product.grupo || product.apelido || product.unidade)}</span></span></button>`;
    }).join('');
    grid.querySelectorAll('[data-code]').forEach(button => button.addEventListener('click', () => openProduct(button.dataset.code)));
  }

  async function searchProducts() {
    const query = search.value.trim();
    if (query.length < 2) {
      grid.innerHTML = ''; status.textContent = 'Digite ao menos 2 caracteres para pesquisar'; count.textContent = ''; return;
    }
    status.textContent = 'Buscando produtos…'; count.textContent = '';
    try {
      const { produtos } = await request(`/api/produtos?q=${encodeURIComponent(query)}`);
      renderResults(produtos);
      status.textContent = produtos.length ? 'Resultados encontrados' : 'Nenhum produto encontrado';
      count.textContent = produtos.length ? `${produtos.length} item${produtos.length === 1 ? '' : 'ns'}` : '';
      if (!produtos.length) grid.innerHTML = empty('Tente pesquisar por outro código, nome ou apelido.');
    } catch (error) {
      grid.innerHTML = `<div class="modal-error">${esc(error.message)}</div>`;
      status.textContent = 'Consulta indisponível';
    }
  }

  function tabContent(data) {
    const p = data.produto || {};
    const extra = p.dados || {};
    const m = data.material;
    const photos = data.fotos || [];
    const suppliers = data.fornecedores || [];
    const costs = data.custos || [];
    const measures = data.medidas || [];
    const weightStack = `<div class="weight-stack">${field('Peso líquido',p.peso_liquido ? `${num(p.peso_liquido)} kg` : null,'weight-field weight-liquid')}${field('Peso bruto',p.peso_bruto ? `${num(p.peso_bruto)} kg` : null,'weight-field weight-gross')}${field('Peso estimado',extra.peso_estimado ? `${num(extra.peso_estimado)} kg` : null,'weight-field weight-estimated')}</div>`;
    const main = `<section class="product-section principal-section"><h3><i class="fa-solid fa-cube"></i> Identificação</h3><div class="info-grid principal-grid">${field('Código',p.codigo)}${field('Situação',p.situacao)}${field('Data de cadastro',date(p.data_cadastro))}${field('Nome',p.nome,'full')}${field('Cliente',p.cliente_nome,'full')}${field('Grupo',p.grupo)}${field('Subgrupo',p.subgrupo)}${weightStack}${field('NCM',p.ncm)}${field('Divisão',p.divisao)}${field('Observação',p.observacao,'full observation-field')}</div></section>`;
    const prices = `<section class="product-section"><h3><i class="fa-solid fa-tag"></i> Custos e venda</h3><div class="metric-grid"><div class="metric"><label>Custo médio</label><strong>${money(p.custo_medio)}</strong></div><div class="metric"><label>Custo de compra</label><strong>${money(p.custo_compra)}</strong></div><div class="metric"><label>Custo sem impostos</label><strong>${money(p.custo_sem_impostos)}</strong></div><div class="metric"><label>Venda 1</label><strong>${money(p.preco_venda)}</strong></div></div></section><section class="product-section"><h3><i class="fa-solid fa-clock-rotate-left"></i> Histórico de custos</h3>${costs.length ? `<table class="product-table"><thead><tr><th>Data</th><th>Custo anterior</th><th>Custo novo</th><th>Usuário</th><th>Observação</th></tr></thead><tbody>${costs.map(row => `<tr><td>${date(row.data)}</td><td>${money(row.custo_anterior)}</td><td>${money(row.custo_novo)}</td><td>${text(row.usuario)}</td><td>${text(row.observacao)}</td></tr>`).join('')}</tbody></table>` : empty('Não há histórico de custos sincronizado para este produto.')}</section>`;
    const chemistry = m?.composicao_quimica || {};
    const material = m ? `<section class="product-section"><h3><i class="fa-solid fa-flask"></i> Material e processo</h3><div class="info-grid">${field('Material',m.material,'wide')}${field('Código do material',m.material_id)}${field('Lote',m.lote)}${field('Modelo',m.modelo)}${field('Processo',m.processo)}${field('Local do modelo',m.propriedades?.local_modelo)}${field('Local do produto',m.propriedades?.local_produto || m.local)}${field('Contração',m.contracao)}${field('Peso estimado',m.peso_estimado ? `${num(m.peso_estimado)} kg` : null)}${field('Dureza',m.dureza_min || m.dureza_max ? `${num(m.dureza_min)} a ${num(m.dureza_max)} HB` : null)}${field('Revisão',m.revisao)}${field('Documento',m.documento)}${field('Observação',m.observacao,'full')}</div></section><section class="product-section"><h3><i class="fa-solid fa-atom"></i> Composição química</h3><div class="chemistry">${Array.isArray(chemistry) && chemistry.length ? chemistry.map(item => field(item.elemento, item.min !== null || item.max !== null ? `${num(item.min)} — ${num(item.max)}` : null)).join('') : empty('Composição química não cadastrada.')}</div></section>` : empty('Material não cadastrado para este produto.');
    const photosPanel = photos.length ? `<div class="photo-grid">${photos.map(photo => `<div class="product-photo"><img src="${photo.foto_base64}" alt="Foto do produto" loading="lazy"></div>`).join('')}</div>` : empty('Não há fotos cadastradas para este produto.');
    const purchases = suppliers.length ? `<table class="product-table"><thead><tr><th>Fornecedor</th><th>CÃ³digo do fornecedor</th><th>CÃ³digo do produto</th><th>PreÃ§o unitÃ¡rio</th><th>Principal</th><th>AtualizaÃ§Ã£o</th></tr></thead><tbody>${suppliers.map(row => `<tr><td>${text(row.fornecedor_nome)}</td><td>${text(row.fornecedor_codigo)}</td><td>${text(row.codigo_produto_fornecedor)}</td><td>${money(row.preco_unitario)}</td><td>${row.principal ? 'Sim' : 'â€”'}</td><td>${date(row.data_hora)}</td></tr>`).join('')}</tbody></table>` : empty('NÃ£o hÃ¡ fornecedores vinculados a este produto.');
    const measurePanel = Object.keys(measures).length ? `<div class="info-grid">${Object.entries(measures).map(([key,value]) => field(key.replace(/_/g, ' '), value, '')).join('')}</div>` : empty('Não há medidas ou certificados cadastrados para este produto.');
    const commercial = `<section class="product-section"><h3><i class="fa-solid fa-briefcase"></i> Comercial e fiscal</h3><div class="info-grid">${field('IPI',p.ipi ? `${num(p.ipi)}%` : null)}${field('Preço de venda 2',money(p.preco_venda_2))}${field('Preço de venda 3',money(p.preco_venda_3))}${field('Referência base',extra.referencia_base)}${field('Referência',extra.referencia)}${field('Modelo',extra.modelo)}${field('Desuso',extra.desuso)}${field('Movimenta estoque',extra.movimenta_estoque)}${field('Fator de carga',extra.fator_carga)}${field('Estoque mínimo',extra.estoque_minimo)}${field('Comissão',extra.comissao ? `${num(extra.comissao)}%` : null)}${field('Observação fiscal',p.observacao_fiscal,'full')}</div></section>`;
    return { principal:main, precos:prices, material, fotos:photosPanel, compras:purchases, medidas:measurePanel, comercial:commercial };
  }

  function showTab(name) {
    document.querySelectorAll('.product-tabs button').forEach(button => {
      const active = button.dataset.tab === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.product-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === name));
  }

  async function openProduct(code) {
    dialog.showModal(); modalLoading.hidden = false; modalContent.hidden = true; panels.innerHTML = '';
    document.getElementById('modalCode').textContent = code;
    document.getElementById('productDialogTitle').textContent = 'Carregando produto';
    document.getElementById('modalSubtitle').textContent = '';
    try {
      const data = await request(`/api/produtos/${encodeURIComponent(code)}`);
      const p = data.produto;
      document.getElementById('modalCode').textContent = `Produto · ${p.codigo}`;
      document.getElementById('productDialogTitle').textContent = p.nome || p.codigo;
      document.getElementById('modalSubtitle').textContent = p.apelido || p.cliente || '';
      panels.innerHTML = Object.entries(tabContent(data)).map(([name, html]) => `<div class="product-panel${name === 'principal' ? ' active' : ''}" data-panel="${name}">${html}</div>`).join('');
      modalLoading.hidden = true; modalContent.hidden = false;
      showTab('principal');
    } catch (error) {
      modalLoading.hidden = true; panels.innerHTML = `<div class="modal-error">${esc(error.message)}</div>`; modalContent.hidden = false;
    }
  }

  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(searchProducts, 280); });
  search.addEventListener('keydown', event => { if (event.key === 'Enter') { clearTimeout(timer); searchProducts(); } });
  document.getElementById('closeProductDialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.querySelectorAll('.product-tabs button').forEach(button => {
    button.addEventListener('pointerdown', event => { event.preventDefault(); showTab(button.dataset.tab); });
    button.addEventListener('click', event => { event.preventDefault(); showTab(button.dataset.tab); });
  });
})();
