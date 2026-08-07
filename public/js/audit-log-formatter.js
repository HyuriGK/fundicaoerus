(function () {
    if (window.ErusAuditLogFormatter) return;

    const SCREENS = {
        'index.html': 'Dashboard', 'login.html': 'Login', 'pedidos.html': 'Carteira de Pedidos',
        'carteira.html': 'Carteira', 'clientes.html': 'CRM de Clientes', 'emissoes.html': 'Painel de Emissoes',
        'faturamentos.html': 'Faturamento', 'faturamento_detalhado.html': 'Faturamento Detalhado',
        faturamento_firebird: 'Faturamento', 'refugos.html': 'Refugos', 'refugo.html': 'Refugos',
        'apontamentos_produtivos.html': 'Apontamentos Produtivos', 'producao_apontada.html': 'Producao Apontada',
        producao_paradas_ap: 'Paradas de Producao', producao_metas: 'Metas de Producao',
        producao_funcionarios: 'Funcionarios da Producao', 'ordemdeproducao.html': 'Ordens de Producao',
        'monitoramento.html': 'Monitoramento', 'acabamento_externo.html': 'Acabamento Externo',
        acabamento_externo: 'Acabamento Externo', 'acabamento_interno.html': 'Acabamento Interno',
        'acabamneto_interno.html': 'Acabamento Interno', 'usinagem_externa.html': 'Usinagem Externa',
        'usinagem_externo.html': 'Usinagem Externa', usinagem_externo: 'Usinagem Externa',
        'programacaofusao.html': 'Programacao da Fusao', 'programacaodesmoldagem.html': 'Programacao da Desmoldagem',
        'aderencia.html': 'Aderencia', 'otif.html': 'OTIF', 'centrocusto.html': 'Centro de Custo',
        'custos.html': 'Custos Gerais', 'custopeca.html': 'Custo por Peca', 'devolucoes.html': 'Devolucoes',
        'fichatecmoldagem.html': 'Ficha Tecnica de Moldagem', 'fichatecfusao.html': 'Ficha Tecnica de Fusao',
        'fichatecacabamento.html': 'Ficha Tecnica de Acabamento', 'fichatecnica.html': 'Ficha Tecnica',
        'insumosmoldagem.html': 'Insumos de Moldagem', 'rh.html': 'RH', 'planner.html': 'Planner',
        planner_tasks: 'Planner', 'chamados.html': 'Chamados de TI', chamados: 'Chamados de TI',
        chamados_html: 'Chamados de TI', 'solicitarchamados.html': 'Solicitar Chamado',
        ti_chamados: 'Chamados de TI', ti_senhas: 'Senhas de TI', 'comunicacao.html': 'Comunicacao',
        communications: 'Comunicacao', users: 'Administracao de Usuarios', 'admin.html': 'Administracao',
        page_locks: 'Bloqueio de Telas', pedidos_op_links: 'Carteira de Pedidos',
        pesos_customizados: 'Peso de Pecas', 'amostras.html': 'Amostras', 'comparativo.html': 'Comparativo',
        'processos.html': 'Processos', 'relatorio-entradas-fezer': 'Relatorio de Entradas Fezer',
        'relatorio-entradas-fezer.html': 'Relatorio de Entradas Fezer'
    };

    const META = {
        PAGE_VISIT: ['Acessou tela', 'fa-arrow-up-right-from-square', '#38bdf8'],
        MODAL_OPEN: ['Abriu janela', 'fa-window-maximize', '#38bdf8'],
        LOGIN: ['Entrou no sistema', 'fa-right-to-bracket', '#10b981'],
        LOGOUT: ['Saiu do sistema', 'fa-right-from-bracket', '#a1a1aa'],
        LOGOUT_MANUAL: ['Saiu do sistema', 'fa-right-from-bracket', '#a1a1aa'],
        SESSION_TIMEOUT: ['Sessao expirada', 'fa-hourglass-end', '#71717a'],
        SELECT_CHART: ['Alterou grafico', 'fa-chart-column', '#3b82f6'],
        SELECT_VISAO_PEDIDOS: ['Alterou visao', 'fa-chart-line', '#3b82f6'],
        VINCULO_OP: ['Alterou vinculo de OP', 'fa-link', '#6366f1'],
        UPDATE_PESO: ['Alterou peso', 'fa-weight-hanging', '#f59e0b'],
        UPDATE_PESO_PEDIDOS: ['Alterou peso', 'fa-weight-hanging', '#f59e0b'],
        UPDATE_PESO_APONTAMENTOS: ['Alterou peso', 'fa-weight-hanging', '#f59e0b'],
        UPDATE_PESO_REFUGOS: ['Alterou peso', 'fa-weight-hanging', '#f59e0b'],
        UPDATE_OBSERVACAO: ['Alterou observacao', 'fa-comment-dots', '#fbbf24'],
        UPDATE_MODELO_STATUS: ['Alterou status do modelo', 'fa-pen', '#fbbf24'],
        UPDATE_PREVISAO_ENTREGA: ['Alterou previsao de entrega', 'fa-calendar-day', '#fbbf24'],
        UPDATE_QUALIDADE_CARGA: ['Alterou qualidade da carga', 'fa-shield-halved', '#fbbf24'],
        ADD_PARADA: ['Registrou parada', 'fa-circle-stop', '#ef4444'],
        ADD_PARADA_APONTAMENTOS: ['Registrou parada', 'fa-circle-stop', '#ef4444'],
        UPDATE_PARADA: ['Alterou parada', 'fa-pen', '#fbbf24'],
        UPDATE_PARADA_APONTAMENTOS: ['Alterou parada', 'fa-pen', '#fbbf24'],
        DELETE_PARADA: ['Excluiu parada', 'fa-trash', '#ef4444'],
        DELETE_PARADA_APONTAMENTOS: ['Excluiu parada', 'fa-trash', '#ef4444'],
        NOVA_CARGA: ['Criou carga', 'fa-truck-ramp-box', '#10b981'],
        ADD_ITEM_CARGA: ['Adicionou item a carga', 'fa-plus', '#10b981'],
        REMOVE_ITEM_CARGA: ['Removeu item da carga', 'fa-trash', '#ef4444'],
        RECEBER_ITEM: ['Marcou item como recebido', 'fa-box-open', '#10b981'],
        DESMARCAR_ITEM: ['Desmarcou recebimento', 'fa-rotate-left', '#f59e0b'],
        LOCK_PAGE: ['Bloqueou tela', 'fa-lock', '#ef4444'], UNLOCK_PAGE: ['Liberou tela', 'fa-lock-open', '#10b981'],
        SEND_MESSAGE: ['Enviou comunicado', 'fa-bullhorn', '#3b82f6'], UPDATE_ROLE: ['Alterou cargo', 'fa-user-gear', '#a855f7'],
        UPDATE_USER_EMAIL: ['Alterou e-mail', 'fa-envelope', '#a855f7'],
        UPDATE_MONETARY_PERM: ['Alterou permissao monetaria', 'fa-money-bill', '#a855f7'],
        UPDATE_AFTER_HOURS_PERM: ['Alterou acesso fora do horario', 'fa-clock', '#a855f7'],
        APPROVE_USER: ['Aprovou usuario', 'fa-user-check', '#10b981'], BAN_USER: ['Baniu usuario', 'fa-user-slash', '#ef4444'],
        BLOCK_USER: ['Bloqueou usuario', 'fa-user-lock', '#ef4444'], KICK_USER: ['Desconectou usuario', 'fa-user-xmark', '#ef4444'],
        ABRIR_CHAMADO: ['Abriu chamado', 'fa-headset', '#3b82f6'], ATUALIZAR_CHAMADO: ['Alterou chamado', 'fa-ticket', '#fbbf24'],
        DELETE_CHAMADO: ['Excluiu chamado', 'fa-trash', '#ef4444'], CRIAR_SENHA_TI: ['Cadastrou senha de TI', 'fa-key', '#10b981'],
        ATUALIZAR_SENHA_TI: ['Alterou senha de TI', 'fa-key', '#fbbf24'], DELETE_SENHA_TI: ['Excluiu senha de TI', 'fa-trash', '#ef4444'],
        EXPORTAR_EXCEL: ['Exportou para Excel', 'fa-file-excel', '#22c55e'], EXPORTAR_EXCEL_REFUGOS: ['Exportou para Excel', 'fa-file-excel', '#22c55e'],
        EXPORTAR_PDF: ['Exportou para PDF', 'fa-file-pdf', '#ef4444'], GERAR_PDF_FICHA: ['Gerou PDF da ficha', 'fa-file-pdf', '#ef4444'],
        GERAR_EMAIL: ['Gerou e-mail', 'fa-envelope', '#3b82f6'], TROCAR_TEMA: ['Alterou tema', 'fa-palette', '#a855f7'],
        POSICAO_INDUSTRIAL: ['Acessou posicao industrial', 'fa-industry', '#6366f1'],
        CONSULTAR_CENTRO_CUSTO: ['Consultou centro de custo', 'fa-calculator', '#38bdf8'],
        ACESSO_BLOQUEADO: ['Acesso bloqueado', 'fa-ban', '#ef4444']
    };

    const PT_WORDS = {
        grafico:'gr\u00e1fico', graficos:'gr\u00e1ficos', emissao:'emiss\u00e3o', emissoes:'emiss\u00f5es', producao:'produ\u00e7\u00e3o',
        programacao:'programa\u00e7\u00e3o', funcionarios:'funcion\u00e1rios', funcionario:'funcion\u00e1rio', tecnica:'t\u00e9cnica',
        pecas:'pe\u00e7as', peca:'pe\u00e7a', aderencia:'ader\u00eancia', comunicacao:'comunica\u00e7\u00e3o', usuarios:'usu\u00e1rios',
        usuario:'usu\u00e1rio', sessao:'sess\u00e3o', observacao:'observa\u00e7\u00e3o', previsao:'previs\u00e3o', vinculo:'v\u00ednculo',
        codigo:'c\u00f3digo', maquina:'m\u00e1quina', periodo:'per\u00edodo', metrica:'m\u00e9trica', visao:'vis\u00e3o',
        opcao:'op\u00e7\u00e3o', acoes:'a\u00e7\u00f5es', acao:'a\u00e7\u00e3o', relatorio:'relat\u00f3rio', alteracao:'altera\u00e7\u00e3o',
        monetaria:'monet\u00e1ria', monetarios:'monet\u00e1rios', permissoes:'permiss\u00f5es', permissao:'permiss\u00e3o',
        horario:'hor\u00e1rio', apos:'ap\u00f3s', preco:'pre\u00e7o', mes:'m\u00eas', nao:'n\u00e3o', posicao:'posi\u00e7\u00e3o',
        fusao:'fus\u00e3o', administracao:'administra\u00e7\u00e3o'
    };

    function portuguese(text) {
        return String(text || '').replace(/[A-Za-z]+/g, word => {
            const replacement = PT_WORDS[word.toLowerCase()];
            if (!replacement) return word;
            if (word === word.toUpperCase()) return replacement.toUpperCase();
            return word[0] === word[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
        });
    }

    function parse(details) {
        if (!details) return {};
        if (typeof details === 'object') return details;
        try { return JSON.parse(details); } catch (_) { return {}; }
    }

    function screen(tableName) {
        if (SCREENS[tableName]) return portuguese(SCREENS[tableName]);
        return portuguese(String(tableName || 'Sistema').replace(/\.html$/i, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    }

    function meta(action) {
        if (/^Acessou Painel de Emiss/i.test(action)) return { label:'Acessou painel de emissoes', icon:'fa-arrow-up-right-from-square', color:'#38bdf8' };
        if (META[action]) return { label:META[action][0], icon:META[action][1], color:META[action][2] };
        if (/^VISUALIZAR_VALORES_/.test(action)) return { label:'Exibiu valores', icon:'fa-eye', color:'#38bdf8' };
        if (/^OCULTAR_VALORES_/.test(action)) return { label:'Ocultou valores', icon:'fa-eye-slash', color:'#a1a1aa' };
        if (/^NEGAR_/.test(action)) return { label:'Acao nao autorizada', icon:'fa-ban', color:'#ef4444' };
        const text = String(action || 'Atividade').replace(/_/g, ' ').toLowerCase();
        const patterns = [
            [/^ABRIR_/, 'Abriu ', /^abrir /, 'fa-folder-open', '#38bdf8'], [/^SELECT_/, 'Alterou filtro: ', /^select /, 'fa-filter', '#3b82f6'],
            [/^(UPDATE_|ATUALIZAR_)/, 'Alterou ', /^(update|atualizar) /, 'fa-pen', '#fbbf24'], [/^GERAR_/, 'Gerou ', /^gerar /, 'fa-file-circle-plus', '#10b981'],
            [/^SALVAR_/, 'Salvou ', /^salvar /, 'fa-floppy-disk', '#10b981'], [/^CARREGAR_/, 'Carregou ', /^carregar /, 'fa-folder-open', '#38bdf8'],
            [/^COPIAR_/, 'Copiou ', /^copiar /, 'fa-copy', '#38bdf8'], [/^IMPORTAR_/, 'Importou ', /^importar /, 'fa-file-import', '#10b981'],
            [/^LIMPAR_/, 'Limpou ', /^limpar /, 'fa-eraser', '#ef4444'], [/^(ADD_|CRIAR_)/, 'Adicionou ', /^(add|criar) /, 'fa-plus', '#10b981'],
            [/^(DELETE_|EXCLUIR_|REMOVE_)/, 'Removeu ', /^(delete|excluir|remove) /, 'fa-trash', '#ef4444'],
            [/^INCLUIR_/, 'Incluiu ', /^incluir /, 'fa-plus', '#10b981'], [/^VISUALIZAR_/, 'Exibiu ', /^visualizar /, 'fa-eye', '#38bdf8'],
            [/^OCULTAR_/, 'Ocultou ', /^ocultar /, 'fa-eye-slash', '#a1a1aa'], [/^NEGAR_/, 'Acao nao autorizada', /^negar .*/, 'fa-ban', '#ef4444']
        ];
        for (const [test, prefix, remove, icon, color] of patterns) {
            if (test.test(action)) return { label:prefix + text.replace(remove, ''), icon, color };
        }
        return { label:text.replace(/\b\w/g, c => c.toUpperCase()), icon:'fa-circle-info', color:'#a1a1aa' };
    }

    function period(d, action) {
        const year = d.ano || d.year;
        const month = d.mes ?? d.month;
        if (!year && month === undefined) return '';
        if (month === undefined || month === null || String(month).toUpperCase() === 'ANO') return `todo o ano de ${year}`;
        if (/APONTAMENTOS/.test(action) && Number(month) === 0) return `todo o ano de ${year}`;
        if (/REFUGOS/.test(action) && Number(month) === -1) return `todo o ano de ${year}`;
        const number = Number(month) + (/REFUGOS/.test(action) ? 1 : 0);
        const months = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
        return number >= 1 && number <= 12 ? `${months[number - 1]} de ${year}` : `o periodo ${month || year}`;
    }

    function datePt(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
    }

    function sentence(action, d, tela, actionMeta) {
        const value = (...keys) => keys.map(key => d[key]).find(v => v !== undefined && v !== null && v !== '');
        const selectedPeriod = period(d, action);
        const target = value('affected_user','cliente','titulo','codigo','produto','pedido','op');
        if (action === 'PAGE_VISIT') return `Acessou a tela ${tela}.`;
        if (/^Acessou Painel de Emiss/i.test(action)) return 'Acessou a tela Painel de Emissoes.';
        if (action === 'MODAL_OPEN') return `Abriu ${value('modal_title','modal_id') || 'uma janela'} na tela ${tela}.`;
        if (action === 'LOGIN') return `Entrou no sistema${d.name ? ` como ${d.name}` : ''}${d.role ? `, com o cargo ${d.role}` : ''}.`;
        if (action === 'LOGOUT' || action === 'LOGOUT_MANUAL') return 'Saiu do sistema.';
        if (action === 'SESSION_TIMEOUT') return `A sessao foi encerrada apos ${d.inativo_min || '?'} minutos sem atividade.`;
        if (action === 'SELECT_CHART') return `Alterou para o grafico ${value('grafico') || 'selecionado'}.`;
        if (action === 'SELECT_VISAO_PEDIDOS') return `Alterou para a visao ${value('visao','modo') || 'selecionada'} no grafico ${value('grafico_nome','grafico_codigo','grafico') || 'de pedidos'}.`;
        if (/^SELECT_GRAFICO_/.test(action)) return `Alterou para o grafico ${value('grafico','modo') || 'selecionado'}${selectedPeriod ? ` em ${selectedPeriod}` : ''}.`;
        if (/^SELECT_DASHBOARD_/.test(action)) return `Alterou para o painel ${value('visao') || 'selecionado'}.`;
        if (/^SELECT_PERIODO_/.test(action)) return `Filtrou a tela ${tela} por ${selectedPeriod || value('periodo') || 'outro periodo'}.`;
        if (/^SELECT_ANO_/.test(action)) return `Filtrou a tela ${tela} pelo ano de ${d.ano || '?'}.`;
        if (/^SELECT_MES_REFUGOS/.test(action)) return `Filtrou a tela ${tela} por ${selectedPeriod || 'outro mes'}.`;
        if (/^SELECT_MES_/.test(action)) return `Filtrou a tela ${tela} pelo mes ${d.mes || '?'}.`;
        if (/^SELECT_SETOR_/.test(action)) return `Filtrou por setor: ${d.setor || 'todos'}.`;
        const dimension = action.match(/^SELECT_(LIGA|GRUPO|VENDEDOR)_/)?.[1]?.toLowerCase();
        if (dimension) return `Filtrou por ${dimension}: ${value(dimension) || 'todos'}.`;
        if (/^SELECT_METRICA_/.test(action)) {
            const names = { first:'primeira entrega', complete:'entrega completa', preco:'preco medio', valor:'faturamento', peso:'peso' };
            return `Alterou a metrica para ${names[d.metrica] || d.metrica || 'a opcao selecionada'}.`;
        }
        if (action === 'SELECT_FILTRO_MATERIAL_PRAZO_FAT') return `Filtrou o prazo de entrega por grupo ${d.grupo || 'todos'} e material ${d.material || 'todos'}.`;
        if (/^ABRIR_REGISTROS_/.test(action)) return `Visualizou os registros de ${tela}${selectedPeriod ? ` de ${selectedPeriod}` : ''}.`;
        if (/^ABRIR_DETALHE_/.test(action)) return `Abriu os detalhes em ${tela}${target ? ` de ${target}` : ''}.`;
        if (/^ABRIR_/.test(action)) return `${actionMeta.label}${target ? `: ${target}` : ''}.`;
        if (action === 'VINCULO_OP') {
            const verbs = { confirmado:'Vinculou', removido:'Removeu o vinculo da', ignorado:'Ignorou a sugestao da', sugerido:'Sugeriu vinculo para a' };
            return `${verbs[d.status] || 'Alterou o vinculo da'} OP ${d.op || '?'}.`;
        }
        if (/^UPDATE_PESO/.test(action)) {
            const before = value('peso_anterior','antes'); const after = value('peso_novo','depois','peso');
            return before !== undefined ? `Alterou o peso ${target ? `do codigo ${target} ` : ''}de ${before} para ${after || '?'} kg.` : `Definiu o peso ${target ? `do codigo ${target} ` : ''}como ${after || '?'} kg.`;
        }
        if (action === 'UPDATE_OBSERVACAO') return `Alterou a observacao${d.pedido ? ` do pedido ${d.pedido}` : ''}.`;
        if (action === 'UPDATE_MODELO_STATUS') return `Alterou o status do modelo de ${d.antes || 'vazio'} para ${d.depois || 'vazio'}.`;
        if (/^(ADD|UPDATE|DELETE)_PARADA/.test(action)) return `${actionMeta.label}${d.setor ? ` no setor ${d.setor}` : ''}${d.maquina ? `, maquina ${d.maquina}` : ''}${d.data ? `, em ${datePt(d.data)}` : ''}.`;
        if (['NOVA_CARGA','ADD_ITEM_CARGA','REMOVE_ITEM_CARGA','RECEBER_ITEM','DESMARCAR_ITEM'].includes(action)) return `${actionMeta.label}${d.carga ? ` ${d.carga}` : ''}${d.codigo ? `, item ${d.codigo}` : ''}.`;
        if (action === 'UPDATE_PREVISAO_ENTREGA') return `Alterou a previsao de entrega da carga ${d.carga || '?'} para ${datePt(d.valor) || '?'}.`;
        if (action === 'UPDATE_QUALIDADE_CARGA') return `Alterou a qualidade da carga ${d.carga || '?'} para ${value('qualidade','valor','status') || '?'}.`;
        if (/^(EXCLUIR|INCLUIR)_(CLIENTE|ITEM|FAT_PESO)/.test(action)) return `${actionMeta.label}${target ? `: ${target}` : ''}.`;
        if (/^(VISUALIZAR|OCULTAR)_VALORES_/.test(action)) return `${actionMeta.label} na tela ${tela}.`;
        if (/^NEGAR_/.test(action)) return `Tentou realizar uma acao sem permissao na tela ${tela}.`;
        if (action === 'UPDATE_ROLE') return `Alterou o cargo de ${d.affected_user || '?'} para ${d.new_role || '?'}.`;
        if (action === 'UPDATE_USER_EMAIL') return `Alterou o e-mail de ${d.affected_user || '?'}.`;
        if (action === 'UPDATE_MONETARY_PERM') return `Alterou as permissoes de valores monetarios de ${d.affected_user || '?'}.`;
        if (action === 'UPDATE_AFTER_HOURS_PERM') return `${d.can_access_after_hours ? 'Liberou' : 'Removeu'} o acesso fora do horario para ${d.affected_user || '?'}.`;
        if (['APPROVE_USER','BAN_USER','BLOCK_USER','KICK_USER'].includes(action)) return `${actionMeta.label}: ${d.affected_user || '?'}.`;
        if (action === 'LOCK_PAGE' || action === 'UNLOCK_PAGE') return `${actionMeta.label}: ${screen(d.page_id)}${d.lock_reason ? `. Motivo: ${d.lock_reason}` : ''}.`;
        if (action === 'SEND_MESSAGE') {
            const count = Number(d.recipients || 0); return `Enviou um comunicado para ${d.recipients === 'ALL' ? 'todos os usuarios' : `${count} ${count === 1 ? 'usuario' : 'usuarios'}`}.`;
        }
        if (/CHAMADO/.test(action) || /SENHA_TI/.test(action)) return `${actionMeta.label}${target ? `: ${target}` : ''}${d.status ? `. Status: ${d.status}` : ''}.`;
        if (/^EXPORTAR_/.test(action)) return `${actionMeta.label}${d.registros !== undefined ? ` com ${d.registros} registros` : ''}${d.arquivo ? ` no arquivo ${d.arquivo}` : ''}.`;
        if (/PROGRAMACAO_ACABAMENTO_INTERNO/.test(action)) return `${actionMeta.label}${d.data ? ` para ${datePt(d.data)}` : ''}.`;
        if (action === 'UPDATE_META') return `Definiu a meta de ${d.mes_ano || 'periodo selecionado'} em ${Number(d.meta || 0).toLocaleString('pt-BR')} kg.`;
        if (/UPDATE_FUNCIONARIOS/.test(action)) return `Atualizou a quantidade de funcionarios${d.mes_ano ? ` de ${d.mes_ano}` : ''}.`;
        if (action === 'TROCAR_TEMA') return `Alterou o tema de ${d.de || '?'} para ${d.para || '?'}.`;
        if (action === 'CONSULTAR_CENTRO_CUSTO') return `Consultou o Centro de Custo${d.total !== undefined ? ` e visualizou ${d.total} itens` : ''}.`;
        if (action === 'POSICAO_INDUSTRIAL') return 'Acessou a tela Posicao Industrial.';
        const ignored = new Set(['device_type','viewport','user_agent','url','title','page','pathname','href','antes','depois']);
        const fields = Object.entries(d).filter(([key, item]) => !ignored.has(key) && item !== null && item !== '' && typeof item !== 'object').slice(0, 4).map(([key, item]) => `${key.replace(/_/g, ' ')} ${item}`).join(', ');
        return `${actionMeta.label}${fields ? `: ${fields}` : ` na tela ${tela}`}.`;
    }

    function format(log) {
        const action = String(log && log.action || 'ATIVIDADE');
        const details = parse(log && log.details);
        const tela = screen(log && log.table_name);
        const actionMeta = meta(action);
        return {
            label: portuguese(actionMeta.label), icon: actionMeta.icon, color: actionMeta.color, tela,
            details: portuguese(sentence(action, details, tela, actionMeta))
        };
    }

    window.ErusAuditLogFormatter = { format };
})();
