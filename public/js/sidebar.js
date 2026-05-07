(function() {
    var SIDEBAR_WIDTH = '280px';
    var SIDEBAR_WIDTH_COLLAPSED = '80px';

    // Inject sidebar CSS
    var style = document.createElement('style');
    style.textContent = [
        ':root { --erus-ease: cubic-bezier(0.16,1,0.3,1); }',
        // Fixed sidebar
        '#erus-sidebar {',
        '  position: fixed; left: 0; top: 0; bottom: 0;',
        '  width: ' + SIDEBAR_WIDTH + ';',
        '  background: linear-gradient(180deg,#0c0c0f 0%,#0a0a0d 50%,#0d0d10 100%);',
        '  border-right: 1px solid rgba(255,255,255,0.04);',
        '  display: flex; flex-direction: column;',
        '  padding: 20px 14px;',
        '  z-index: 200;',
        '  transition: width 0.3s var(--erus-ease);',
        '  overflow: hidden;',
        '}',
        '#erus-sidebar::after {',
        '  content:""; position:absolute; right:-1px; top:0; bottom:0; width:1px;',
        '  background:linear-gradient(180deg,transparent,rgba(251,191,36,0.15) 30%,rgba(251,191,36,0.08) 70%,transparent);',
        '}',
        // Brand
        '#erus-sidebar .erus-brand {',
        '  display:flex; align-items:center; gap:12px;',
        '  padding:8px 12px; margin-bottom:20px;',
        '  cursor:pointer; border-radius:12px;',
        '  background:rgba(251,191,36,0.03); border:1px solid rgba(251,191,36,0.06);',
        '  text-decoration:none; flex-shrink:0;',
        '  transition:all 0.3s var(--erus-ease); white-space:nowrap; overflow:hidden;',
        '}',
        '#erus-sidebar .erus-brand:hover { background:rgba(251,191,36,0.06); border-color:rgba(251,191,36,0.12); }',
        '#erus-sidebar .erus-brand-icon { width:42px; height:42px; border-radius:10px; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; }',
        '#erus-sidebar .erus-brand-icon img { width:100%; height:100%; object-fit:contain; }',
        '#erus-sidebar .erus-brand-text h1 { font-size:0.95rem; font-weight:800; margin:0; color:#fff; letter-spacing:-0.3px; }',
        '#erus-sidebar .erus-brand-text p { font-size:0.65rem; color:#fbbf24; margin:0; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; }',
        // Nav
        '#erus-sidebar .erus-nav-menu { list-style:none; padding:0; margin:0; flex-grow:1; overflow-y:auto; scrollbar-width:none; }',
        '#erus-sidebar .erus-nav-menu::-webkit-scrollbar { display:none; }',
        '#erus-sidebar .erus-nav-link {',
        '  display:flex; align-items:center; padding:9px 12px; border-radius:10px;',
        '  color:#a1a1aa; font-size:0.82rem; font-weight:500;',
        '  transition:all 0.2s var(--erus-ease); margin-bottom:3px;',
        '  text-decoration:none; cursor:pointer; min-height:38px; position:relative;',
        '  white-space:nowrap; overflow:hidden;',
        '}',
        '#erus-sidebar .erus-nav-link:hover { background:rgba(255,255,255,0.04); color:#fff; }',
        '#erus-sidebar .erus-nav-link.active { color:#fbbf24; background:rgba(251,191,36,0.08); font-weight:600; }',
        '#erus-sidebar .erus-nav-link.active::before { content:""; position:absolute; left:0; top:50%; transform:translateY(-50%); width:3px; height:18px; border-radius:0 3px 3px 0; background:#fbbf24; box-shadow:0 0 8px rgba(251,191,36,0.4); }',
        '#erus-sidebar .erus-nav-link i { width:22px; margin-right:10px; text-align:center; font-size:0.85rem; transition:all 0.2s; opacity:0.7; flex-shrink:0; }',
        '#erus-sidebar .erus-nav-link:hover i, #erus-sidebar .erus-nav-link.active i { opacity:1; }',
        // Group separator
        '#erus-sidebar .erus-nav-group-sep { margin:16px 0 6px; padding:4px 12px; display:flex; align-items:center; cursor:pointer; border-radius:6px; transition:background 0.2s; overflow:hidden; }',
        '#erus-sidebar .erus-nav-group-label { font-size:0.6rem; text-transform:uppercase; letter-spacing:0.15em; color:#52525b; font-weight:800; white-space:nowrap; }',
        '#erus-sidebar .erus-nav-group-line { height:1px; flex-grow:1; background:linear-gradient(to right,rgba(255,255,255,0.06),transparent); margin:2px 10px 0; }',
        '#erus-sidebar .erus-nav-group-wrapper { overflow:hidden; transition:max-height 0.4s var(--erus-ease); max-height:500px; }',
        '#erus-sidebar .erus-nav-group-wrapper.collapsed { max-height:0; }',
        // Footer
        '#erus-sidebar .erus-sidebar-footer { margin-top:auto; padding-top:12px; border-top:1px solid rgba(255,255,255,0.04); }',
        '#erus-sidebar .erus-sidebar-footer .erus-nav-link { font-size:0.78rem; }',
        '#erus-sidebar .erus-logout-link { color:#ef4444 !important; }',
        '#erus-sidebar .erus-logout-link:hover { background-color:rgba(239,68,68,0.08) !important; }',
        '#erus-sidebar .erus-notif-dot { width:8px; height:8px; border-radius:50%; background:#ef4444; margin-left:auto; flex-shrink:0; box-shadow:0 0 6px rgba(239,68,68,0.6); }',
        // Collapsed state — hide text
        'body.erus-sidebar-collapsed #erus-sidebar { width:' + SIDEBAR_WIDTH_COLLAPSED + '; }',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-brand-text,',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link span,',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-label,',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-line,',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep .fa-plus,',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep .fa-minus,',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-notif-dot { display:none; }',
        // Collapsed nav links — icon pill style
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link {',
        '  justify-content:center; padding:0;',
        '  width:44px; height:44px; margin:2px auto;',
        '  border-radius:12px;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link i {',
        '  margin-right:0; width:auto; font-size:1rem; opacity:0.55;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link:hover i { opacity:1; }',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link.active {',
        '  background:rgba(251,191,36,0.12); border-radius:12px;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link.active i { opacity:1; color:#fbbf24; }',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link.active::before { display:none; }',
        // Collapsed group sep — icon only, centered
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep {',
        '  justify-content:center; padding:0; margin:10px auto 2px;',
        '  width:44px; height:28px; border-radius:6px; cursor:pointer;',
        '  background:transparent;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep i:first-child {',
        '  display:inline-block; margin-right:0; font-size:0.72rem; opacity:0.35;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep:hover i:first-child { opacity:0.7; }',
        // Collapsed brand
        'body.erus-sidebar-collapsed #erus-sidebar .erus-brand { justify-content:center; padding:8px; margin-bottom:12px; }',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-brand-icon { width:38px; height:38px; }',
        // Collapsed footer links — identical pill style to nav links
        'body.erus-sidebar-collapsed #erus-sidebar .erus-sidebar-footer {',
        '  display:flex; flex-direction:column; align-items:center; padding-top:8px;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-sidebar-footer .erus-nav-link {',
        '  width:44px; height:44px; margin:2px 0; padding:0;',
        '  display:flex; align-items:center; justify-content:center;',
        '  border-radius:12px;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-sidebar-footer .erus-nav-link i {',
        '  margin-right:0; width:auto; font-size:1rem; opacity:0.55;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-sidebar-footer .erus-nav-link:hover i { opacity:1; }',
        // Sidebar backdrop (overlay)
        '#erus-sidebar-backdrop { display:none; position:fixed; inset:0; z-index:199; background:rgba(0,0,0,0.35); }',
        'body:not(.erus-sidebar-collapsed) #erus-sidebar-backdrop { display:block; }',
        // Modals
        '#erus-logout-modal, #erus-pref-modal { display:none; position:fixed; inset:0; z-index:9999; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); }',
        '#erus-logout-modal.open, #erus-pref-modal.open { display:flex; }',
        // Hide old side-menu elements when erus-sidebar is active
        '.side-menu, .side-menu-trigger { display:none !important; }'
    ].join('\n');
    document.head.appendChild(style);

    var currentPage = window.location.pathname.split('/').pop() || 'index.html';

    function isActive(page) {
        return currentPage === page ? ' active' : '';
    }

    var sidebarHTML = '<aside id="erus-sidebar">' +
        '<a href="index.html" class="erus-brand" id="erus-brand">' +
            '<div class="erus-brand-icon"><img src="logo.png" alt="Logo Erus"></div>' +
            '<div class="erus-brand-text"><h1>SGP - Erus</h1><p>Processos</p></div>' +
        '</a>' +
        '<ul class="erus-nav-menu">' +
            '<a href="index.html" class="erus-nav-link' + isActive('index.html') + '">' +
                '<i class="fa-solid fa-chart-pie"></i><span>Dashboard</span></a>' +
            // COMERCIAL
            '<div class="erus-nav-group-sep" onclick="erusSidebarToggleGroup(\'eg-comercial\')">' +
                '<i class="fas fa-shopping-cart" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Comercial</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-comercial"></i>' +
            '</div>' +
            '<div id="eg-comercial" class="erus-nav-group-wrapper collapsed">' +
                '<a href="pedidos.html" class="erus-nav-link' + isActive('pedidos.html') + '">' +
                    '<i class="fa-solid fa-briefcase"></i><span>Carteira</span></a>' +
            '</div>' +
            // PPCP
            '<div class="erus-nav-group-sep" onclick="erusSidebarToggleGroup(\'eg-producao\')">' +
                '<i class="fas fa-industry" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">PPCP</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-producao"></i>' +
            '</div>' +
            '<div id="eg-producao" class="erus-nav-group-wrapper collapsed">' +
                '<a href="apontamentos_produtivos.html" class="erus-nav-link' + isActive('apontamentos_produtivos.html') + '">' +
                    '<i class="fa-solid fa-industry"></i><span>Produção Apontada</span></a>' +
                '<a href="ordemdeproducao.html" class="erus-nav-link' + isActive('ordemdeproducao.html') + '">' +
                    '<i class="fa-solid fa-file-lines"></i><span>Ordens de Produção</span></a>' +
                '<a href="fichatecnica.html" class="erus-nav-link' + isActive('fichatecnica.html') + '">' +
                    '<i class="fa-solid fa-file-contract"></i><span>Ficha Técnica</span></a>' +
                '<a href="fichatecacabamento.html" class="erus-nav-link' + isActive('fichatecacabamento.html') + '">' +
                    '<i class="fa-solid fa-hammer"></i><span>Ficha de Acabamento</span></a>' +
                '<a href="monitoramento.html" class="erus-nav-link' + isActive('monitoramento.html') + '">' +
                    '<i class="fa-solid fa-display"></i><span>Monitoramento de OPs</span></a>' +
            '</div>' +
            // FATURAMENTO
            '<div class="erus-nav-group-sep" onclick="erusSidebarToggleGroup(\'eg-faturamento\')">' +
                '<i class="fas fa-sack-dollar" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Faturamento</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-faturamento"></i>' +
            '</div>' +
            '<div id="eg-faturamento" class="erus-nav-group-wrapper collapsed">' +
                '<a href="faturamentos.html" class="erus-nav-link' + isActive('faturamentos.html') + '">' +
                    '<i class="fa-solid fa-sack-dollar"></i><span>Produção Faturada</span></a>' +
            '</div>' +
            // TERCEIRIZAÇÃO
            '<div class="erus-nav-group-sep" onclick="erusSidebarToggleGroup(\'eg-acabamento\')">' +
                '<i class="fas fa-truck-moving" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Terceirização</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-acabamento"></i>' +
            '</div>' +
            '<div id="eg-acabamento" class="erus-nav-group-wrapper collapsed">' +
                '<a href="acabamento_externo.html" class="erus-nav-link' + isActive('acabamento_externo.html') + '">' +
                    '<i class="fa-solid fa-truck-fast"></i><span>Acabamento Externo</span></a>' +
            '</div>' +
            // CUSTOS
            '<div class="erus-nav-group-sep" onclick="erusSidebarToggleGroup(\'eg-custos\')">' +
                '<i class="fas fa-coins" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Custos</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-custos"></i>' +
            '</div>' +
            '<div id="eg-custos" class="erus-nav-group-wrapper collapsed">' +
                '<a href="#" onclick="erusSidebarAccessCustos(event)" class="erus-nav-link' + isActive('custos.html') + '">' +
                    '<i class="fa-solid fa-file-invoice-dollar"></i><span>Custos Gerais</span></a>' +
                '<a href="custopeca.html" class="erus-nav-link' + isActive('custopeca.html') + '">' +
                    '<i class="fa-solid fa-calculator"></i><span>Calculadora</span></a>' +
            '</div>' +
            // INDICADORES
            '<div class="erus-nav-group-sep" onclick="erusSidebarToggleGroup(\'eg-indicadores\')">' +
                '<i class="fas fa-gauge-high" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Indicadores</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-indicadores"></i>' +
            '</div>' +
            '<div id="eg-indicadores" class="erus-nav-group-wrapper collapsed">' +
                '<a href="otif.html" class="erus-nav-link' + isActive('otif.html') + '">' +
                    '<i class="fa-solid fa-truck-fast"></i><span>OTIF</span></a>' +
            '</div>' +
            // CONTROLES
            '<div class="erus-nav-group-sep" onclick="erusSidebarToggleGroup(\'eg-controles\')">' +
                '<i class="fas fa-sliders" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Controles</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-controles"></i>' +
            '</div>' +
            '<div id="eg-controles" class="erus-nav-group-wrapper collapsed">' +
                '<a href="aderencia.html" class="erus-nav-link' + isActive('aderencia.html') + '">' +
                    '<i class="fa-solid fa-check-double"></i><span>Aderência</span></a>' +
                '<a href="refugos.html" class="erus-nav-link' + isActive('refugos.html') + '">' +
                    '<i class="fa-solid fa-trash-can"></i><span>Refugo</span></a>' +
                '<a href="devolucoes.html" class="erus-nav-link' + isActive('devolucoes.html') + '">' +
                    '<i class="fa-solid fa-rotate-left"></i><span>Devoluções</span></a>' +
            '</div>' +
            // EM DESENVOLVIMENTO
            '<div id="erus-sep-desenvolvimento" class="erus-nav-group-sep" onclick="erusSidebarToggleGroup(\'eg-desenvolvimento\')" style="display:none;">' +
                '<i class="fas fa-screwdriver-wrench" style="font-size:0.8rem;color:#ef4444;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label" style="color:#ef4444;">Em desenvolvimento</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-desenvolvimento"></i>' +
            '</div>' +
            '<div id="eg-desenvolvimento" class="erus-nav-group-wrapper collapsed"></div>' +
        '</ul>' +
        '<div class="erus-sidebar-footer">' +
            '<a href="#" id="erus-admin-btn" class="erus-nav-link" onclick="erusSidebarOpenAdmin()" style="display:none;">' +
                '<i class="fa-solid fa-users-gear"></i><span>Sistema Admin</span>' +
                '<div class="erus-notif-dot" id="erus-admin-notif" style="display:none;"></div>' +
            '</a>' +
            '<a href="#" class="erus-nav-link" onclick="erusSidebarOpenPrefs(); return false;">' +
                '<i class="fa-solid fa-sliders"></i><span>Preferências</span></a>' +
            '<a href="#" onclick="erusSidebarOpenLogout()" class="erus-nav-link erus-logout-link">' +
                '<i class="fa-solid fa-right-from-bracket"></i><span>Sair do Sistema</span></a>' +
        '</div>' +
    '</aside>';

    var logoutModalHTML = '<div id="erus-logout-modal">' +
        '<div style="max-width:360px;width:92%;text-align:center;padding:30px 20px;border-radius:12px;background:#18181b;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);border:1px solid #27272a;">' +
            '<div style="font-size:2.5rem;color:#ef4444;margin-bottom:20px;"><i class="fa-solid fa-arrow-right-from-bracket"></i></div>' +
            '<h2 style="font-size:1.25rem;margin:0 0 10px;font-weight:700;color:#fff;">Deseja realmente sair?</h2>' +
            '<p style="color:#a1a1aa;font-size:0.9rem;margin-bottom:30px;">Sua sessão no sistema será encerrada.</p>' +
            '<div style="display:flex;gap:15px;justify-content:center;">' +
                '<button onclick="document.getElementById(\'erus-logout-modal\').classList.remove(\'open\')" style="background:#3f3f46;color:#fff;flex:1;padding:10px;font-weight:600;border-radius:6px;border:none;cursor:pointer;font-family:inherit;">Cancelar</button>' +
                '<button onclick="erusSidebarDoLogout()" style="background:#ef4444;color:#fff;flex:1;padding:10px;font-weight:600;border-radius:6px;border:none;cursor:pointer;font-family:inherit;">Sim, Sair</button>' +
            '</div>' +
        '</div>' +
    '</div>';

    var prefsModalHTML = '<div id="erus-pref-modal" onclick="if(event.target===this)this.classList.remove(\'open\')">' +
        '<div style="max-width:440px;width:92%;border-radius:16px;overflow:hidden;background:#18181b;border:1px solid #27272a;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">' +
            '<div style="padding:24px 28px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                    '<div style="width:38px;height:38px;border-radius:10px;background:rgba(217,119,6,0.12);border:1px solid rgba(217,119,6,0.2);display:flex;align-items:center;justify-content:center;color:#d97706;font-size:1rem;"><i class="fa-solid fa-sliders"></i></div>' +
                    '<div><div style="font-size:1.05rem;font-weight:800;color:#fafafa;letter-spacing:-0.02em;">Preferências</div>' +
                    '<div style="font-size:0.68rem;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Personalização do Sistema</div></div>' +
                '</div>' +
                '<button onclick="document.getElementById(\'erus-pref-modal\').classList.remove(\'open\')" style="width:32px;height:32px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#a1a1aa;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.9rem;"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div style="padding:24px 28px;">' +
                '<div style="font-size:0.7rem;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-palette" style="color:#d97706;"></i> Aparência</div>' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">' +
                    '<div><div style="font-size:0.85rem;font-weight:600;color:#fafafa;margin-bottom:3px;">Tema de Interface</div>' +
                    '<div style="font-size:0.75rem;color:#a1a1aa;">Alterne entre o tema escuro e o tema claro.</div></div>' +
                    '<button id="erus-theme-btn" onclick="erusSidebarToggleTheme()" style="flex-shrink:0;display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:24px;border:1px solid rgba(217,119,6,0.25);background:rgba(217,119,6,0.08);color:#d97706;cursor:pointer;font-size:0.8rem;font-weight:600;white-space:nowrap;min-width:148px;justify-content:center;">' +
                        '<i class="fa-solid fa-sun" style="font-size:0.95rem;"></i><span>Tema Claro</span></button>' +
                '</div>' +
                '<div style="display:flex;gap:8px;margin-top:16px;">' +
                    '<div id="erus-chip-dark" onclick="erusSidebarSetTheme(\'dark\')" style="flex:1;border-radius:10px;padding:12px;border:2px solid transparent;cursor:pointer;background:linear-gradient(135deg,#09090b,#18181b);">' +
                        '<div style="height:6px;border-radius:3px;background:#27272a;margin-bottom:5px;"></div>' +
                        '<div style="height:4px;border-radius:2px;background:#3f3f46;width:70%;"></div>' +
                        '<div style="height:4px;border-radius:2px;background:#3f3f46;width:50%;margin-top:4px;"></div>' +
                        '<div style="margin-top:8px;font-size:0.65rem;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">Escuro</div>' +
                    '</div>' +
                    '<div id="erus-chip-light" onclick="erusSidebarSetTheme(\'light\')" style="flex:1;border-radius:10px;padding:12px;border:2px solid transparent;cursor:pointer;background:linear-gradient(135deg,#f0f2f5,#fff);">' +
                        '<div style="height:6px;border-radius:3px;background:#e5e7eb;margin-bottom:5px;"></div>' +
                        '<div style="height:4px;border-radius:2px;background:#d1d5db;width:70%;"></div>' +
                        '<div style="height:4px;border-radius:2px;background:#d1d5db;width:50%;margin-top:4px;"></div>' +
                        '<div style="margin-top:8px;font-size:0.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Claro</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div style="padding:16px 28px 20px;display:flex;justify-content:flex-end;">' +
                '<button onclick="document.getElementById(\'erus-pref-modal\').classList.remove(\'open\')" style="padding:9px 22px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fafafa;cursor:pointer;font-size:0.82rem;font-weight:600;font-family:inherit;">Fechar</button>' +
            '</div>' +
        '</div>' +
    '</div>';

    function applyPaddingLeft() {
        var SKIP_IDS = ['erus-sidebar', 'erus-sidebar-backdrop', 'erus-logout-modal', 'erus-pref-modal', 'global-loader'];
        // Classes that indicate an overlay/modal/toast — should NOT be shifted
        var OVERLAY_CLASSES = ['modal-overlay', 'modal', 'toast-container', 'toast', 'overlay', 'dim-layer', 'loading-screen'];
        var children = document.body.children;
        for (var i = 0; i < children.length; i++) {
            var el = children[i];
            if (SKIP_IDS.indexOf(el.id) !== -1) continue;
            // Skip overlays/modals by class
            var isOverlay = OVERLAY_CLASSES.some(function(cls) { return el.classList.contains(cls); });
            if (isOverlay) continue;
            var pos = window.getComputedStyle(el).position;
            if (pos === 'fixed') {
                // Skip tooltips and pointer-events:none elements
                if (window.getComputedStyle(el).pointerEvents === 'none') continue;
                // Only shift fixed elements that start at left:0 (main layout, not popups)
                var computedLeft = window.getComputedStyle(el).left;
                if (computedLeft === '0px' || computedLeft === 'auto') {
                    el.style.setProperty('left', SIDEBAR_WIDTH_COLLAPSED, 'important');
                    el.style.setProperty('width', 'calc(100% - ' + SIDEBAR_WIDTH_COLLAPSED + ')', 'important');
                }
            } else if (pos !== 'absolute') {
                el.style.setProperty('margin-left', SIDEBAR_WIDTH_COLLAPSED, 'important');
            }
        }
    }

    function init() {
        if (document.getElementById('erus-sidebar')) return;

        // Inject sidebar
        document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
        // Inject backdrop
        document.body.insertAdjacentHTML('afterbegin', '<div id="erus-sidebar-backdrop"></div>');
        // Inject modals at end
        document.body.insertAdjacentHTML('beforeend', logoutModalHTML);
        document.body.insertAdjacentHTML('beforeend', prefsModalHTML);

        // Always start collapsed in secondary pages
        document.body.classList.add('erus-sidebar-collapsed');
        applyPaddingLeft();

        // Brand click = toggle collapse
        var brandEl = document.getElementById('erus-brand');
        if (brandEl) {
            brandEl.addEventListener('click', function(e) {
                e.preventDefault();
                document.body.classList.toggle('erus-sidebar-collapsed');
            });
        }

        // Click outside sidebar to collapse
        document.addEventListener('click', function(e) {
            if (!document.body.classList.contains('erus-sidebar-collapsed')) {
                var sidebar = document.getElementById('erus-sidebar');
                if (sidebar && !sidebar.contains(e.target)) {
                    document.body.classList.add('erus-sidebar-collapsed');
                }
            }
        });

        // Role-based visibility
        var role = (localStorage.getItem('erus_role') || '').toLowerCase();
        var adminBtn = document.getElementById('erus-admin-btn');
        if (adminBtn && (role === 'desenvolvedor' || role === 'admin')) {
            adminBtn.style.display = 'flex';
        }

        erusSidebarUpdateThemeUI();

        // Load page locks — move dev pages to "Em desenvolvimento"
        fetch('/api/page-locks')
            .then(function(r) { return r.json(); })
            .then(function(result) {
                if (!result.success) return;
                var devGroup = document.getElementById('eg-desenvolvimento');
                var devSep = document.getElementById('erus-sep-desenvolvimento');
                if (!devGroup || !devSep) return;
                var hasLocked = false;
                result.data.forEach(function(l) {
                    if (!l.is_locked || l.lock_reason !== 'development') return;
                    var link = document.querySelector('#erus-sidebar .erus-nav-link[href="' + l.page_id + '"]');
                    if (!link) return;
                    if (!link.dataset.originalGroup) {
                        var parent = link.closest('.erus-nav-group-wrapper');
                        if (parent) link.dataset.originalGroup = parent.id;
                    }
                    devGroup.appendChild(link);
                    hasLocked = true;
                });
                if (hasLocked) devSep.style.display = 'flex';
            })
            .catch(function() {});
    }

    // ---- Global sidebar functions ----
    window.erusSidebarToggleGroup = function(id) {
        var isCollapsed = document.body.classList.contains('erus-sidebar-collapsed');
        var group = document.getElementById(id);
        var icon = document.getElementById('icon-' + id);
        if (isCollapsed) {
            document.body.classList.remove('erus-sidebar-collapsed');
            if (group) {
                group.classList.remove('collapsed');
                if (icon) { icon.classList.remove('fa-plus'); icon.classList.add('fa-minus'); }
            }
            return;
        }
        if (group) {
            if (group.classList.contains('collapsed')) {
                group.classList.remove('collapsed');
                if (icon) { icon.classList.remove('fa-plus'); icon.classList.add('fa-minus'); }
            } else {
                group.classList.add('collapsed');
                if (icon) { icon.classList.remove('fa-minus'); icon.classList.add('fa-plus'); }
            }
        }
    };

    window.erusSidebarOpenLogout = function() {
        document.getElementById('erus-logout-modal').classList.add('open');
    };

    window.erusSidebarDoLogout = function() {
        localStorage.removeItem('erus_token');
        localStorage.removeItem('erus_role');
        localStorage.removeItem('erus_user');
        window.location.href = 'login.html';
    };

    window.erusSidebarOpenPrefs = function() {
        document.getElementById('erus-pref-modal').classList.add('open');
        erusSidebarUpdateThemeUI();
    };

    window.erusSidebarOpenAdmin = function() {
        if (typeof openAdminModal === 'function') openAdminModal();
        else window.location.href = 'index.html';
    };

    window.erusSidebarAccessCustos = function(e) {
        e.preventDefault();
        var role = (localStorage.getItem('erus_role') || '').toLowerCase();
        if (role === 'desenvolvedor') {
            window.location.href = 'custos.html';
        } else {
            if (typeof showToast === 'function') {
                showToast('Acesso Negado', 'Permissão de Desenvolvedor necessária.', 'danger');
            } else {
                alert('Acesso negado. Permissão de Desenvolvedor necessária.');
            }
        }
    };

    window.erusSidebarToggleTheme = function() {
        var current = localStorage.getItem('erus_theme') || 'dark';
        erusSidebarSetTheme(current === 'dark' ? 'light' : 'dark');
    };

    window.erusSidebarSetTheme = function(theme) {
        localStorage.setItem('erus_theme', theme);
        if (typeof ErusTheme !== 'undefined') ErusTheme.apply(theme);
        else document.documentElement.setAttribute('data-theme', theme);
        erusSidebarUpdateThemeUI();
    };

    window.erusSidebarUpdateThemeUI = function() {
        var theme = localStorage.getItem('erus_theme') || 'dark';
        var btn = document.getElementById('erus-theme-btn');
        var chipDark = document.getElementById('erus-chip-dark');
        var chipLight = document.getElementById('erus-chip-light');
        if (btn) {
            var icon = btn.querySelector('i');
            var label = btn.querySelector('span');
            if (theme === 'light') {
                if (icon) icon.className = 'fa-solid fa-moon';
                if (label) label.textContent = 'Tema Escuro';
                btn.style.borderColor = 'rgba(79,70,229,0.35)';
                btn.style.background = 'rgba(79,70,229,0.12)';
                btn.style.color = '#4f46e5';
            } else {
                if (icon) icon.className = 'fa-solid fa-sun';
                if (label) label.textContent = 'Tema Claro';
                btn.style.borderColor = 'rgba(217,119,6,0.25)';
                btn.style.background = 'rgba(217,119,6,0.08)';
                btn.style.color = '#d97706';
            }
        }
        if (chipDark) chipDark.style.borderColor = theme === 'dark' ? '#fbbf24' : 'transparent';
        if (chipLight) chipLight.style.borderColor = theme === 'light' ? '#d97706' : 'transparent';
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
