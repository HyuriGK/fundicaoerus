(function() {
    var SIDEBAR_WIDTH = '280px';
    var SIDEBAR_WIDTH_COLLAPSED = '80px';
    var MOBILE_BREAKPOINT = 900;

    function ensureUiComponents() {
        if (window.ErusUI || document.getElementById('erus-ui-components-js')) return;
        var s = document.createElement('script');
        s.id = 'erus-ui-components-js';
        s.src = 'js/ui-components.js';
        document.head.appendChild(s);
    }
    ensureUiComponents();

    function ensureConfirmDialog() {
        if (window.erusConfirm) return Promise.resolve();
        var existing = document.getElementById('erus-confirm-dialog-js');
        if (existing) {
            return new Promise(function(resolve) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', resolve, { once: true });
            });
        }
        return new Promise(function(resolve) {
            var s = document.createElement('script');
            s.id = 'erus-confirm-dialog-js';
            s.src = 'js/confirm-dialog.js?v=20260617';
            s.onload = resolve;
            s.onerror = resolve;
            document.head.appendChild(s);
        });
    }

    function disableTouchZoom() {
        var viewport = document.querySelector('meta[name="viewport"]');
        var content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }
        viewport.setAttribute('content', content);

        if (window.__erusTouchZoomDisabled) return;
        window.__erusTouchZoomDisabled = true;

        document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
        document.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });
        document.addEventListener('gestureend', function(e) { e.preventDefault(); }, { passive: false });
        document.addEventListener('touchmove', function(e) {
            if (e.touches && e.touches.length > 1) e.preventDefault();
        }, { passive: false });

        var lastTouchEnd = 0;
        document.addEventListener('touchend', function(e) {
            var now = Date.now();
            if (now - lastTouchEnd <= 300) e.preventDefault();
            lastTouchEnd = now;
        }, { passive: false });
    }
    disableTouchZoom();

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
        '  z-index: 2000;',
        '  transition: width 0.3s var(--erus-ease);',
        '  overflow: hidden;',
        '  user-select: none; -webkit-user-select: none; -ms-user-select: none;',
        '}',
        '#erus-sidebar * { user-select: none; -webkit-user-select: none; -ms-user-select: none; }',
        '#erus-sidebar::after {',
        '  content:""; position:absolute; right:-1px; top:0; bottom:0; width:1px;',
        '  background:linear-gradient(180deg,transparent,rgba(251,191,36,0.15) 30%,rgba(251,191,36,0.08) 70%,transparent);',
        '}',
        // Brand
        '#erus-sidebar .erus-brand {',
        '  display:flex; align-items:center; gap:12px;',
        '  padding:8px 12px; margin-bottom:20px;',
        '  cursor:pointer; border-radius:12px;',
        '  background:transparent; border:1px solid transparent;',
        '  text-decoration:none; flex-shrink:0;',
        '  transition:all 0.3s var(--erus-ease); white-space:nowrap; overflow:hidden;',
        '}',
        '#erus-sidebar .erus-brand:hover { background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.06); }',
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
        '#erus-sidebar .erus-nav-link.active { color:#d4d4d8; background:rgba(63,63,70,0.35); font-weight:600; }',
        '#erus-sidebar .erus-nav-link.active::before { content:""; position:absolute; left:0; top:50%; transform:translateY(-50%); width:3px; height:18px; border-radius:0 3px 3px 0; background:#a1a1aa; box-shadow:none; }',
        '#erus-sidebar .erus-nav-link i { width:22px; margin-right:10px; text-align:center; font-size:0.85rem; transition:all 0.2s; opacity:0.7; flex-shrink:0; }',
        '#erus-sidebar .erus-nav-link:hover i, #erus-sidebar .erus-nav-link.active i { opacity:1; }',
        '#erus-sidebar .erus-nav-group-sep .fa-plus, #erus-sidebar .erus-nav-group-sep .fa-minus { width:18px; min-width:18px; height:18px; line-height:18px; display:inline-flex; align-items:center; justify-content:center; font-size:0.72rem; margin-left:0; flex-shrink:0; }',
        // DEV tag (telas em desenvolvimento)
        '#erus-sidebar .erus-dev-tag { margin-left:8px; padding:1px 6px; font-size:0.56rem; font-weight:800; letter-spacing:0.06em; line-height:1.5; border-radius:5px; background:rgba(139,92,246,0.16); color:#a78bfa; border:1px solid rgba(139,92,246,0.45); text-transform:uppercase; flex-shrink:0; }',
        // Group separator
        '#erus-sidebar .erus-nav-group-sep { margin:16px 0 6px; padding:4px 12px; display:flex; align-items:center; cursor:pointer; border-radius:6px; transition:background 0.2s; overflow:hidden; }',
        '#erus-sidebar .erus-nav-group-label { font-size:0.6rem; text-transform:uppercase; letter-spacing:0.15em; color:#52525b; font-weight:800; white-space:nowrap; }',
        '#erus-sidebar .erus-nav-group-line { height:1px; flex-grow:1; background:linear-gradient(to right,rgba(255,255,255,0.06),transparent); margin:2px 10px 0; }',
        '#erus-sidebar .erus-nav-group-wrapper { overflow:hidden; transition:max-height 0.4s var(--erus-ease); max-height:500px; }',
        '#erus-sidebar .erus-nav-group-wrapper.collapsed { max-height:0; }',
        '#erus-sidebar .erus-nav-group-sep.active-group > i:first-child { color:#a1a1aa !important; opacity:1 !important; }',
        '#erus-sidebar .erus-nav-group-sep.active-group { background:transparent !important; }',
        // Footer
        '#erus-sidebar .erus-sidebar-footer { margin-top:auto; padding-top:12px; border-top:1px solid rgba(255,255,255,0.04); }',
        '#erus-sidebar .erus-sidebar-footer .erus-nav-link { font-size:0.78rem; }',
        '#erus-sidebar .erus-logout-link { color:#ef4444 !important; }',
        '#erus-sidebar .erus-logout-link:hover { background-color:rgba(239,68,68,0.08) !important; }',
        '#erus-sidebar .erus-notif-dot { width:8px; height:8px; border-radius:50%; background:#ef4444; margin-left:auto; flex-shrink:0; box-shadow:0 0 6px rgba(239,68,68,0.6); }',
        // Light theme
        'html[data-theme="light"] #erus-sidebar { background:linear-gradient(180deg,#ffffff 0%,#f8fafc 52%,#f1f5f9 100%); border-right:1px solid rgba(15,23,42,0.10); box-shadow:8px 0 28px rgba(15,23,42,0.08); }',
        'html[data-theme="light"] #erus-sidebar::after { background:linear-gradient(180deg,transparent,rgba(217,119,6,0.18) 28%,rgba(15,23,42,0.08) 70%,transparent); }',
        'html[data-theme="light"] #erus-sidebar .erus-brand:hover { background:rgba(15,23,42,0.04); border-color:rgba(15,23,42,0.08); }',
        'html[data-theme="light"] #erus-sidebar .erus-brand-text h1 { color:#0f172a; }',
        'html[data-theme="light"] #erus-sidebar .erus-brand-text p { color:#d97706; }',
        'html[data-theme="light"] #erus-sidebar .erus-nav-link { color:#475569; }',
        'html[data-theme="light"] #erus-sidebar .erus-nav-link:hover { background:rgba(15,23,42,0.055); color:#0f172a; }',
        'html[data-theme="light"] #erus-sidebar .erus-nav-link.active { color:#111827; background:rgba(217,119,6,0.12); font-weight:700; }',
        'html[data-theme="light"] #erus-sidebar .erus-nav-link.active::before { background:#d97706; box-shadow:0 0 10px rgba(217,119,6,0.22); }',
        'html[data-theme="light"] #erus-sidebar .erus-nav-link.active i { color:#d97706; }',
        'html[data-theme="light"] #erus-sidebar .erus-nav-group-label { color:#64748b; }',
        'html[data-theme="light"] #erus-sidebar .erus-nav-group-line { background:linear-gradient(to right,rgba(15,23,42,0.12),transparent); }',
        'html[data-theme="light"] #erus-sidebar .erus-nav-group-sep:hover { background:rgba(15,23,42,0.045); }',
        'html[data-theme="light"] #erus-sidebar .erus-nav-group-sep.active-group { background:rgba(217,119,6,0.10) !important; }',
        'html[data-theme="light"] #erus-sidebar .erus-nav-group-sep.active-group > i:first-child { color:#d97706 !important; }',
        'html[data-theme="light"] #erus-sidebar .erus-sidebar-footer { border-top:1px solid rgba(15,23,42,0.10); }',
        'html[data-theme="light"] #erus-sidebar .erus-logout-link:hover { background-color:rgba(239,68,68,0.10) !important; }',
        'html[data-theme="light"] body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link.active { background:rgba(217,119,6,0.14); }',
        'html[data-theme="light"] body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link.active i { color:#d97706; }',
        'html[data-theme="light"] body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep { background:rgba(15,23,42,0.035) !important; border-color:rgba(15,23,42,0.08) !important; }',
        'html[data-theme="light"] body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep:hover { background:rgba(15,23,42,0.075) !important; border-color:rgba(15,23,42,0.14) !important; }',
        'html[data-theme="light"] body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep.active-group { background:rgba(217,119,6,0.13) !important; border-color:rgba(217,119,6,0.24) !important; }',
        'html[data-theme="light"] body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep.active-group i:first-child { color:#d97706 !important; }',
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
        '  background:rgba(63,63,70,0.35); border-radius:12px;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link.active i { opacity:1; color:#d4d4d8; }',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link.active::before { display:none; }',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-wrapper { max-height:0 !important; display:none !important; }',
        // Collapsed group sep — icon only, centered, with subtle panel
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep {',
        '  display:flex; align-items:center !important; justify-content:center !important;',
        '  padding:0 !important; margin:8px auto 2px !important;',
        '  width:44px !important; height:32px !important; border-radius:8px !important; cursor:pointer;',
        '  background:rgba(255,255,255,0.04) !important; border:1px solid rgba(255,255,255,0.06) !important;',
        '  overflow:visible !important; transition:background 0.2s, border-color 0.2s !important;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep:hover {',
        '  background:rgba(255,255,255,0.08) !important; border-color:rgba(255,255,255,0.12) !important;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep i:first-child {',
        '  display:block !important; margin:0 !important; font-size:0.72rem; opacity:0.45;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep.active-group { background:rgba(63,63,70,0.35) !important; border-color:rgba(255,255,255,0.08) !important; }',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep.active-group i:first-child { color:#a1a1aa !important; opacity:1 !important; }',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep:hover i:first-child { opacity:0.85; }',
        // Role-based hidden — expanded state (no competing !important, simple rule is enough)
        '#erus-sidebar .erus-role-hidden { display:none !important; }',
        // Role-based hidden — collapsed state: must match specificity of the display:flex !important sep rule to win
        'body.erus-sidebar-collapsed #erus-sidebar .erus-role-hidden { display:none !important; }',
        // Collapsed brand — no background, just the logo centered
        'body.erus-sidebar-collapsed #erus-sidebar .erus-brand {',
        '  justify-content:center; padding:6px; margin-bottom:12px;',
        '  background:transparent; border-color:transparent;',
        '}',
        'body.erus-sidebar-collapsed #erus-sidebar .erus-brand:hover { background:transparent; border-color:transparent; }',
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
        // Modals
        '#erus-logout-modal, #erus-pref-modal { display:none; position:fixed; inset:0; z-index:9999; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); }',
        '#erus-logout-modal.open, #erus-pref-modal.open { display:flex; }',
        '#erus-logout-modal.open { animation:erusFadeIn .22s ease; }',
        '#erus-logout-modal > div { animation:erusLogoutPop .32s cubic-bezier(.16,1,.3,1); }',
        '@keyframes erusFadeIn { from { opacity:0; } to { opacity:1; } }',
        '@keyframes erusLogoutPop { from { opacity:0; transform:translateY(14px) scale(.93); } to { opacity:1; transform:none; } }',
        // Logout exit transition overlay
        '#erus-logout-overlay { position:fixed; inset:0; z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px; background:#09090b; opacity:0; transition:opacity .45s ease; }',
        '#erus-logout-overlay.show { opacity:1; }',
        '#erus-logout-overlay .erus-lo-spinner { width:48px; height:48px; border-radius:50%; border:3px solid rgba(239,68,68,0.22); border-top-color:#ef4444; animation:erusSpin .7s linear infinite; }',
        '#erus-logout-overlay .erus-lo-text { color:#a1a1aa; font-size:0.95rem; font-weight:600; letter-spacing:.3px; animation:erusFadeIn .5s ease; }',
        '@keyframes erusSpin { to { transform:rotate(360deg); } }',
        // Hide old side-menu elements when erus-sidebar is active
        '.side-menu, .side-menu-trigger, body.erus-shared-sidebar-active #sidebar { display:none !important; }',
        'body.erus-shared-sidebar-active { --erus-sidebar-offset:' + SIDEBAR_WIDTH_COLLAPSED + '; }',
        'body.erus-shared-sidebar-active.erus-is-index { --erus-sidebar-offset:' + SIDEBAR_WIDTH + '; }',
        'body.erus-shared-sidebar-active .app-layout { grid-template-columns:0 1fr !important; }',
        'body.erus-shared-sidebar-active .erus-sidebar-content-offset {',
        '  margin-left:var(--erus-sidebar-offset) !important;',
        '  box-sizing:border-box !important;',
        '}',
        '#erus-sidebar.erus-sidebar-pending { visibility:hidden; }',
        'body.erus-shared-sidebar-active .erus-sidebar-content-offset.erus-fill-layout {',
        '  width:calc(100vw - var(--erus-sidebar-offset)) !important;',
        '  max-width:calc(100vw - var(--erus-sidebar-offset)) !important;',
        '}',
        'body.erus-shared-sidebar-active .erus-sidebar-content-offset.erus-fixed-layout {',
        '  left:var(--erus-sidebar-offset) !important;',
        '  right:auto !important;',
        '  margin-left:0 !important;',
        '  width:calc(100vw - var(--erus-sidebar-offset)) !important;',
        '  max-width:calc(100vw - var(--erus-sidebar-offset)) !important;',
        '}',
        'body.erus-shared-sidebar-active .erus-sidebar-content-offset.erus-absolute-layout {',
        '  left:var(--erus-sidebar-offset) !important;',
        '  right:auto !important;',
        '  margin-left:0 !important;',
        '  width:calc(100vw - var(--erus-sidebar-offset)) !important;',
        '  max-width:calc(100vw - var(--erus-sidebar-offset)) !important;',
        '}',
        '#erus-mobile-menu-btn {',
        '  position:fixed; top:12px; left:12px; z-index:2101;',
        '  width:42px; height:42px; border-radius:10px;',
        '  border:1px solid rgba(255,255,255,0.1);',
        '  background:rgba(12,12,15,0.92); color:#fafafa;',
        '  display:none; align-items:center; justify-content:center;',
        '  box-shadow:0 10px 30px rgba(0,0,0,0.35);',
        '  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);',
        '  cursor:pointer;',
        '}',
        '#erus-sidebar-scrim {',
        '  position:fixed; inset:0; z-index:1999; display:none;',
        '  background:rgba(0,0,0,0.55); backdrop-filter:blur(2px);',
        '}',
        '@media (max-width: 900px) {',
        '  body.erus-shared-sidebar-active { --erus-sidebar-offset:0px !important; }',
        '  body.erus-shared-sidebar-active.erus-is-index { --erus-sidebar-offset:0px !important; }',
        '  body.erus-shared-sidebar-active .erus-sidebar-content-offset,',
        '  body.erus-shared-sidebar-active .erus-sidebar-content-offset.erus-fill-layout,',
        '  body.erus-shared-sidebar-active .erus-sidebar-content-offset.erus-fixed-layout,',
        '  body.erus-shared-sidebar-active .erus-sidebar-content-offset.erus-absolute-layout {',
        '    margin-left:0 !important; left:0 !important;',
        '    width:100vw !important; max-width:100vw !important;',
        '  }',
        '  body.erus-shared-sidebar-active .top-header,',
        '  body.erus-shared-sidebar-active .main-header,',
        '  body.erus-shared-sidebar-active .page-header {',
        '    padding-left:64px !important;',
        '  }',
        '  #erus-mobile-menu-btn { display:flex; }',
        '  #erus-sidebar {',
        '    width:min(86vw, 320px) !important;',
        '    padding:64px 14px 20px !important;',
        '    transform:translateX(-105%);',
        '    transition:transform 0.28s var(--erus-ease), width 0.28s var(--erus-ease);',
        '    z-index:2100;',
        '  }',
        '  body.erus-mobile-sidebar-open #mobileRefreshBtn { display:none !important; }',
        '  body.erus-mobile-sidebar-open #erus-sidebar { transform:translateX(0); }',
        '  body.erus-mobile-sidebar-open #erus-sidebar-scrim { display:block; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-brand-text,',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link span,',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-label,',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-line { display:block; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link {',
        '    justify-content:flex-start; padding:9px 12px; width:auto; height:auto; margin-bottom:3px;',
        '  }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-link i {',
        '    width:22px; margin-right:10px; font-size:0.85rem;',
        '  }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-brand { justify-content:flex-start; padding:8px 12px; }',
        '  #erus-sidebar .erus-brand-icon,',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-brand-icon { width:38px !important; height:38px !important; }',
        '  #erus-sidebar .erus-nav-group-sep {',
        '    display:grid !important; grid-template-columns:22px max-content minmax(20px,1fr) 18px !important;',
        '    align-items:center !important; column-gap:8px !important;',
        '    min-height:26px !important; box-sizing:border-box !important;',
        '    overflow:hidden !important;',
        '  }',
        '  #erus-sidebar .erus-nav-group-sep > i:first-child { width:22px !important; margin:0 !important; text-align:center !important; justify-self:center !important; }',
        '  #erus-sidebar .erus-nav-group-sep .erus-nav-group-line { margin:2px 0 0 !important; min-width:20px !important; }',
        '  #erus-sidebar .erus-nav-group-sep .fa-plus,',
        '  #erus-sidebar .erus-nav-group-sep .fa-minus { width:18px !important; min-width:18px !important; height:18px !important; line-height:18px !important; margin:0 !important; justify-self:center !important; }',
        '  #erus-sidebar .erus-nav-group-wrapper { transition:none !important; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-wrapper:not(.collapsed) { max-height:500px !important; display:block !important; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-wrapper.collapsed { max-height:0 !important; display:block !important; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep {',
        '    display:grid !important; grid-template-columns:22px max-content minmax(20px,1fr) 18px !important;',
        '    align-items:center !important; justify-content:stretch !important; column-gap:8px !important;',
        '    padding:4px 12px !important; margin:16px 0 6px !important;',
        '    width:auto !important; height:auto !important; background:transparent !important; border:0 !important;',
        '  }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep i:first-child { display:block !important; width:22px !important; margin:0 !important; text-align:center !important; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep .erus-nav-group-label { min-width:0 !important; letter-spacing:0.14em !important; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep .erus-nav-group-line { margin:2px 0 0 !important; min-width:20px !important; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep .fa-plus,',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-sep .fa-minus { display:inline-flex !important; align-items:center !important; justify-content:center !important; width:18px !important; min-width:18px !important; height:18px !important; line-height:18px !important; margin:0 !important; text-align:center !important; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-nav-group-wrapper { display:block !important; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-sidebar-footer { align-items:stretch; }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-sidebar-footer .erus-nav-link {',
        '    width:auto; height:auto; margin-bottom:3px; padding:9px 12px;',
        '    justify-content:flex-start;',
        '  }',
        '  body.erus-sidebar-collapsed #erus-sidebar .erus-sidebar-footer .erus-nav-link i {',
        '    width:22px; margin-right:10px; font-size:0.85rem;',
        '  }',
        '}',
        // Tooltip for collapsed sidebar
        '#erus-stip { position:fixed; background:#1c1c1f; color:#fafafa; padding:5px 11px; border-radius:7px;',
        '  font-size:0.75rem; font-weight:500; white-space:nowrap; z-index:10000; pointer-events:none;',
        '  border:1px solid rgba(255,255,255,0.1); box-shadow:0 4px 16px rgba(0,0,0,0.55); display:none; }',
        '#erus-stip::before { content:""; position:absolute; right:100%; top:50%; transform:translateY(-50%);',
        '  border:5px solid transparent; border-right-color:#1c1c1f; }'
    ].join('\n');
    document.head.appendChild(style);

    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    var hideMobileMenuButton = /^fichatec.*\.html$/i.test(currentPage) || currentPage === 'ordemdeproducao.html';
    var lastMobileState = null;

    function isActive(page) {
        return currentPage === page ? ' active' : '';
    }

    var sidebarHTML = '<aside id="erus-sidebar">' +
        '<a href="index.html" class="erus-brand" id="erus-brand">' +
            '<div class="erus-brand-icon"><img src="logo.png" alt="Logo Erus"></div>' +
            '<div class="erus-brand-text"><h1>SGP - Erus</h1><p>Processos</p></div>' +
        '</a>' +
        '<ul class="erus-nav-menu">' +
            '<a href="index.html" data-stip="Dashboard" class="erus-nav-link' + isActive('index.html') + '">' +
                '<i class="fa-solid fa-chart-pie"></i><span>Dashboard</span></a>' +
            // COMERCIAL
            '<div class="erus-nav-group-sep" data-stip="Comercial" onclick="erusSidebarToggleGroup(\'eg-comercial\')">' +
                '<i class="fas fa-shopping-cart" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Comercial</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-comercial"></i>' +
            '</div>' +
            '<div id="eg-comercial" class="erus-nav-group-wrapper collapsed">' +
                '<a href="pedidos.html" data-stip="Carteira" class="erus-nav-link' + isActive('pedidos.html') + '">' +
                    '<i class="fa-solid fa-briefcase"></i><span>Carteira</span></a>' +
                '<a href="clientes.html" data-stip="Clientes" class="erus-nav-link' + isActive('clientes.html') + '">' +
                    '<i class="fa-solid fa-users"></i><span>Clientes</span></a>' +
            '</div>' +
            // FATURAMENTO
            '<div class="erus-nav-group-sep" data-stip="Faturamento" onclick="erusSidebarToggleGroup(\'eg-faturamento\')">' +
                '<i class="fas fa-sack-dollar" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Faturamento</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-faturamento"></i>' +
            '</div>' +
            '<div id="eg-faturamento" class="erus-nav-group-wrapper collapsed">' +
                '<a href="faturamentos.html" data-stip="Produção Faturada" class="erus-nav-link' + isActive('faturamentos.html') + '">' +
                    '<i class="fa-solid fa-sack-dollar"></i><span>Produção Faturada</span></a>' +
            '</div>' +
            // PRODUCAO
            '<div class="erus-nav-group-sep" data-stip="Produção" onclick="erusSidebarToggleGroup(\'eg-producao\')">' +
                '<i class="fas fa-industry" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Produção</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-producao"></i>' +
            '</div>' +
            '<div id="eg-producao" class="erus-nav-group-wrapper collapsed">' +
                '<a href="apontamentos_produtivos.html" data-stip="Produção Apontada" class="erus-nav-link' + isActive('apontamentos_produtivos.html') + '">' +
                    '<i class="fa-solid fa-industry"></i><span>Produção Apontada</span></a>' +
                '<a href="monitoramento.html" data-stip="Monitoramento de OPs" class="erus-nav-link' + isActive('monitoramento.html') + '">' +
                    '<i class="fa-solid fa-display"></i><span>Monitoramento de OPs</span></a>' +
                '<a href="ordemdeproducao.html" data-stip="Ordens de Produção" class="erus-nav-link' + isActive('ordemdeproducao.html') + '">' +
                    '<i class="fa-solid fa-file-lines"></i><span>Ordens de Produção</span></a>' +
            '</div>' +
            // SAC
            '<div class="erus-nav-group-sep" data-stip="SAC" onclick="erusSidebarToggleGroup(\'eg-sac\')">' +
                '<i class="fas fa-headset" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">SAC</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-sac"></i>' +
            '</div>' +
            '<div id="eg-sac" class="erus-nav-group-wrapper collapsed">' +
                '<a href="sac.html" data-stip="Reclamações" class="erus-nav-link' + isActive('sac.html') + '">' +
                    '<i class="fa-solid fa-headset"></i><span>Reclamações</span></a>' +
            '</div>' +
            // PPCP
            '<div class="erus-nav-group-sep" data-stip="PPCP" onclick="erusSidebarToggleGroup(\'eg-ppcp\')">' +
                '<i class="fas fa-calendar-check" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">PPCP</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-ppcp"></i>' +
            '</div>' +
            '<div id="eg-ppcp" class="erus-nav-group-wrapper collapsed">' +
                '<a href="acabamento_interno.html" data-stip="Acabamento Interno" class="erus-nav-link' + isActive('acabamento_interno.html') + '">' +
                    '<i class="fa-solid fa-screwdriver-wrench"></i><span>Acabamento Interno</span></a>' +
                '<a href="insumosmoldagem.html" data-stip="Insumos de Moldagem" class="erus-nav-link' + isActive('insumosmoldagem.html') + '">' +
                    '<i class="fa-solid fa-cubes"></i><span>Insumos de Moldagem</span></a>' +
                '<a href="programacaofusao.html" data-stip="Programação da Fusão" class="erus-nav-link' + isActive('programacaofusao.html') + '">' +
                    '<i class="fa-solid fa-fire-flame-curved"></i><span>Programação da Fusão</span></a>' +
                '<a href="programacaodesmoldagem.html" data-stip="Programação Desmoldagem" class="erus-nav-link' + isActive('programacaodesmoldagem.html') + '">' +
                    '<i class="fa-solid fa-calendar-days"></i><span>Programação Desmoldagem</span></a>' +
            '</div>' +
            // TERCEIRIZACAO
            '<div class="erus-nav-group-sep" data-stip="Terceirização" onclick="erusSidebarToggleGroup(\'eg-acabamento\')">' +
                '<i class="fas fa-truck-moving" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Terceirização</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-acabamento"></i>' +
            '</div>' +
            '<div id="eg-acabamento" class="erus-nav-group-wrapper collapsed">' +
                '<a href="acabamento_externo.html" data-stip="Acabamento Externo" class="erus-nav-link' + isActive('acabamento_externo.html') + '">' +
                    '<i class="fa-solid fa-truck-fast"></i><span>Acabamento Externo</span></a>' +
                '<a href="usinagem_externa.html" data-stip="Usinagem Externa" class="erus-nav-link' + isActive('usinagem_externa.html') + '">' +
                    '<i class="fa-solid fa-gears"></i><span>Usinagem Externa</span></a>' +
            '</div>' +
            // ENGENHARIA
            '<div class="erus-nav-group-sep" data-stip="Engenharia" onclick="erusSidebarToggleGroup(\'eg-engenharia\')">' +
                '<i class="fas fa-compass-drafting" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Engenharia</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-engenharia"></i>' +
            '</div>' +
            '<div id="eg-engenharia" class="erus-nav-group-wrapper collapsed">' +
                '<a href="fichatecmoldagem.html" data-stip="Ficha de Moldagem" class="erus-nav-link' + isActive('fichatecmoldagem.html') + '">' +
                    '<i class="fa-solid fa-cubes-stacked"></i><span>Ficha de Moldagem</span></a>' +
                '<a href="fichatecfusao.html" data-stip="Ficha de Fusão" class="erus-nav-link' + isActive('fichatecfusao.html') + '">' +
                    '<i class="fa-solid fa-fire"></i><span>Ficha de Fusão</span></a>' +
                '<a href="fichatecacabamento.html" data-stip="Ficha de Acabamento" class="erus-nav-link' + isActive('fichatecacabamento.html') + '">' +
                    '<i class="fa-solid fa-hammer"></i><span>Ficha de Acabamento</span></a>' +
            '</div>' +
            // CUSTOS
            '<div class="erus-nav-group-sep" data-stip="Custos" onclick="erusSidebarToggleGroup(\'eg-custos\')">' +
                '<i class="fas fa-coins" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Custos</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-custos"></i>' +
            '</div>' +
            '<div id="eg-custos" class="erus-nav-group-wrapper collapsed">' +
                '<a href="#" data-stip="Custos Gerais" data-page-key="custos.html" onclick="erusSidebarAccessCustos(event)" class="erus-nav-link' + isActive('custos.html') + '">' +
                    '<i class="fa-solid fa-file-invoice-dollar"></i><span>Custos Gerais</span></a>' +
                '<a href="custopeca.html" data-stip="Calculadora" class="erus-nav-link' + isActive('custopeca.html') + '">' +
                    '<i class="fa-solid fa-calculator"></i><span>Calculadora</span></a>' +
                '<a href="centrocusto.html" data-stip="Centro de Custo" class="erus-nav-link' + isActive('centrocusto.html') + '">' +
                    '<i class="fa-solid fa-sitemap"></i><span>Centro de Custo</span></a>' +
            '</div>' +
            // CONTROLES
            '<div class="erus-nav-group-sep" data-stip="Controles" onclick="erusSidebarToggleGroup(\'eg-controles\')">' +
                '<i class="fas fa-sliders" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Controles</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-controles"></i>' +
            '</div>' +
            '<div id="eg-controles" class="erus-nav-group-wrapper collapsed">' +
                '<a href="reuniao.html" data-stip="Reunião de Indicadores" class="erus-nav-link' + isActive('reuniao.html') + '">' +
                    '<i class="fa-solid fa-tv"></i><span>Reunião de Indicadores</span></a>' +
                '<a href="refugos.html" data-stip="Refugo" class="erus-nav-link' + isActive('refugos.html') + '">' +
                    '<i class="fa-solid fa-trash-can"></i><span>Refugo</span></a>' +
                '<a href="devolucoes.html" data-stip="Devoluções" class="erus-nav-link' + isActive('devolucoes.html') + '">' +
                    '<i class="fa-solid fa-rotate-left"></i><span>Devoluções</span></a>' +
            '</div>' +
            // FINANCEIRO
            '<div id="erus-sep-financeiro" class="erus-nav-group-sep" data-stip="Financeiro" onclick="erusSidebarToggleGroup(\'eg-financeiro\')">' +
                '<i class="fas fa-balance-scale" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Financeiro</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-financeiro"></i>' +
            '</div>' +
            '<div id="eg-financeiro" class="erus-nav-group-wrapper collapsed">' +
                '<a href="balanco.html" data-stip="Balanço" class="erus-nav-link' + isActive('balanco.html') + '">' +
                    '<i class="fa-solid fa-scale-balanced"></i><span>Balanço</span></a>' +
            '</div>' +
            // RH
            '<div class="erus-nav-group-sep" data-stip="RH" onclick="erusSidebarToggleGroup(\'eg-rh\')">' +
                '<i class="fas fa-id-card-clip" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">RH</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-rh"></i>' +
            '</div>' +
            '<div id="eg-rh" class="erus-nav-group-wrapper collapsed">' +
                '<a href="rh.html" data-stip="Funcionários" class="erus-nav-link' + isActive('rh.html') + '">' +
                    '<i class="fa-solid fa-user-tie"></i><span>Funcionários</span></a>' +
            '</div>' +
            // CHAMADOS TI
            '<div class="erus-nav-group-sep" data-stip="Chamados TI" onclick="erusSidebarToggleGroup(\'eg-chamados\')">' +
                '<i class="fas fa-headset" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">Chamados TI</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-chamados"></i>' +
            '</div>' +
            '<div id="eg-chamados" class="erus-nav-group-wrapper collapsed">' +
                '<a href="solicitarchamados.html" data-stip="Solicitar Chamado" class="erus-nav-link' + isActive('solicitarchamados.html') + '">' +
                    '<i class="fa-solid fa-headset"></i><span>Solicitar Chamado</span></a>' +
            '</div>' +
            // TI
            '<div class="erus-nav-group-sep" data-stip="TI" onclick="erusSidebarToggleGroup(\'eg-ti\')">' +
                '<i class="fas fa-screwdriver-wrench" style="font-size:0.8rem;color:#52525b;margin-right:8px;flex-shrink:0;"></i>' +
                '<span class="erus-nav-group-label">TI</span>' +
                '<div class="erus-nav-group-line"></div>' +
                '<i class="fa-solid fa-plus" id="icon-eg-ti"></i>' +
            '</div>' +
            '<div id="eg-ti" class="erus-nav-group-wrapper collapsed">' +
                '<a href="chamados.html" id="erus-link-chamados-ti" data-stip="Painel TI" class="erus-nav-link' + isActive('chamados.html') + '">' +
                    '<i class="fa-solid fa-ticket"></i><span>Painel TI</span></a>' +
            '</div>' +
            '</ul>' +
        '<div class="erus-sidebar-footer">' +
            '<a href="#" data-stip="Preferências" class="erus-nav-link" onclick="erusSidebarOpenPrefs(); return false;">' +
                '<i class="fa-solid fa-sliders"></i><span>Preferências</span></a>' +
            '<a href="#" data-stip="Sair do Sistema" onclick="erusSidebarOpenLogout()" class="erus-nav-link erus-logout-link">' +
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

    var mobileSidebarHTML =
        '<button id="erus-mobile-menu-btn" type="button" aria-label="Abrir menu" aria-expanded="false">' +
            '<i class="fa-solid fa-bars"></i>' +
        '</button>' +
        '<div id="erus-sidebar-scrim"></div>';

    function isMobileSidebar() {
        return window.matchMedia && window.matchMedia('(max-width: ' + MOBILE_BREAKPOINT + 'px)').matches;
    }

    function setMobileSidebarOpen(open) {
        document.body.classList.toggle('erus-mobile-sidebar-open', !!open);
        var btn = document.getElementById('erus-mobile-menu-btn');
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function syncResponsiveSidebarState() {
        var mobile = isMobileSidebar();
        document.body.classList.toggle('erus-mobile-sidebar', mobile);
        if (mobile !== lastMobileState) {
            setMobileSidebarOpen(false);
            lastMobileState = mobile;
        }
    }

    function ensureLateMobileStyles() {
        if (document.getElementById('erus-late-mobile-css')) return;
        var s = document.createElement('style');
        s.id = 'erus-late-mobile-css';
        s.textContent = [
            '@media (max-width: 900px) {',
            '  html, body { min-height:100dvh !important; overflow-x:hidden !important; }',
            '  body.erus-mobile-sidebar { width:100% !important; max-width:100% !important; }',
            '  body.erus-mobile-sidebar .page-wrapper,',
            '  body.erus-mobile-sidebar .main-wrapper,',
            '  body.erus-mobile-sidebar .main-container,',
            '  body.erus-mobile-sidebar .app-shell,',
            '  body.erus-mobile-sidebar .app-content {',
            '    width:100% !important; max-width:100% !important;',
            '  }',
            '  body.erus-mobile-sidebar .scroll-area,',
            '  body.erus-mobile-sidebar .ti-admin-body {',
            '    padding:14px !important;',
            '    overflow:auto !important;',
            '    -webkit-overflow-scrolling:touch !important;',
            '  }',
            '  body.erus-mobile-sidebar .content-grid,',
            '  body.erus-mobile-sidebar .native-grid-2,',
            '  body.erus-mobile-sidebar .dev-admin-layout,',
            '  body.erus-mobile-sidebar .comm-admin-grid,',
            '  body.erus-mobile-sidebar .password-shell,',
            '  body.erus-mobile-sidebar .modal-cols,',
            '  body.erus-mobile-sidebar .form-grid,',
            '  body.erus-mobile-sidebar .aval-grid,',
            '  body.erus-mobile-sidebar .view-cards-grid,',
            '  body.erus-mobile-sidebar .config-grid,',
            '  body.erus-mobile-sidebar .ld-diff {',
            '    grid-template-columns:1fr !important;',
            '  }',
            '  body.erus-mobile-sidebar .charts-row,',
            '  body.erus-mobile-sidebar .bento-grid {',
            '    grid-template-columns:1fr !important;',
            '    gap:14px !important;',
            '  }',
            '  body.erus-mobile-sidebar .kpi-row {',
            '    display:grid !important;',
            '    grid-template-columns:repeat(2, minmax(0,1fr)) !important;',
            '    gap:12px !important;',
            '  }',
            '  body.erus-mobile-sidebar .kpi-row .kpi-card {',
            '    width:100% !important;',
            '    min-width:0 !important;',
            '  }',
            '  body.erus-mobile-sidebar #kpi-strip { display:flex !important; flex-direction:column !important; flex-wrap:nowrap !important; gap:12px !important; height:auto !important; overflow:visible !important; }',
            '  body.erus-mobile-sidebar #kpi-strip .kpi-card { flex:0 0 auto !important; width:100% !important; height:auto !important; min-height:132px !important; }',
            '  body.erus-mobile-sidebar .detail-row,',
            '  body.erus-mobile-sidebar .modal-info-grid,',
            '  body.erus-mobile-sidebar .password-form-row {',
            '    grid-template-columns:1fr !important;',
            '  }',
            '  body.erus-mobile-sidebar .urgencia-grid { grid-template-columns:repeat(2, minmax(0,1fr)) !important; }',
            '  body.erus-mobile-sidebar .page-header,',
            '  body.erus-mobile-sidebar .ti-admin-header,',
            '  body.erus-mobile-sidebar .top-header,',
            '  body.erus-mobile-sidebar .main-header {',
            '    min-height:auto !important;',
            '    height:auto !important;',
            '    gap:10px !important;',
            '    flex-wrap:wrap !important;',
            '  }',
            '  body.erus-mobile-sidebar .page-header h1,',
            '  body.erus-mobile-sidebar .header-title,',
            '  body.erus-mobile-sidebar .ti-title {',
            '    font-size:1rem !important;',
            '    overflow-wrap:anywhere !important;',
            '  }',
            '  body.erus-mobile-sidebar .card { padding:16px !important; }',
            '  body.erus-mobile-sidebar .modal-card,',
            '  body.erus-mobile-sidebar .modal-content,',
            '  body.erus-mobile-sidebar .detail-card,',
            '  body.erus-mobile-sidebar .ti-admin-card {',
            '    width:100vw !important;',
            '    max-width:100vw !important;',
            '    height:100dvh !important;',
            '    max-height:100dvh !important;',
            '    border-radius:0 !important;',
            '    margin:0 !important;',
            '  }',
            '  body.erus-mobile-sidebar table { font-size:0.76rem !important; }',
            '}',
            '@media (max-width: 640px) {',
            '  body.erus-mobile-sidebar .kpi-row { grid-template-columns:1fr !important; }',
            '  body.erus-mobile-sidebar .scroll-area,',
            '  body.erus-mobile-sidebar .ti-admin-body { padding:10px !important; }',
            '  body.erus-mobile-sidebar .page-header,',
            '  body.erus-mobile-sidebar .ti-admin-header,',
            '  body.erus-mobile-sidebar .top-header,',
            '  body.erus-mobile-sidebar .main-header { padding-right:12px !important; }',
            '}'
        ].join('\n');
        document.head.appendChild(s);
    }

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
                    '<div id="erus-chip-classic" onclick="erusSidebarSetTheme(\'classic\')" style="display:none;flex:1;border-radius:0;padding:12px;border:2px solid transparent;cursor:pointer;background:linear-gradient(135deg,#d4d0c8,#c8c4bc);border-top:2px solid #fff;border-left:2px solid #fff;border-right:2px solid #808080;border-bottom:2px solid #808080;">' +
                        '<div style="height:6px;background:linear-gradient(to right,#000080,#1084d0);margin-bottom:5px;"></div>' +
                        '<div style="height:4px;background:#d4d0c8;border-top:1px solid #fff;border-left:1px solid #fff;border-right:1px solid #808080;border-bottom:1px solid #808080;width:70%;"></div>' +
                        '<div style="height:4px;background:#d4d0c8;border-top:1px solid #fff;border-left:1px solid #fff;border-right:1px solid #808080;border-bottom:1px solid #808080;width:50%;margin-top:4px;"></div>' +
                        '<div style="margin-top:8px;font-size:0.65rem;font-weight:700;color:#000080;text-transform:uppercase;letter-spacing:0.05em;font-family:Tahoma,Arial,sans-serif;">Clássico</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div style="padding:16px 28px 20px;display:flex;justify-content:flex-end;">' +
                '<button onclick="document.getElementById(\'erus-pref-modal\').classList.remove(\'open\')" style="padding:9px 22px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fafafa;cursor:pointer;font-size:0.82rem;font-weight:600;font-family:inherit;">Fechar</button>' +
            '</div>' +
        '</div>' +
    '</div>';

    function isSidebarOffsetCandidate(el) {
        if (!el || !el.tagName) return false;
        if (['SCRIPT', 'STYLE', 'LINK'].indexOf(el.tagName) !== -1) return false;
        if (['erus-sidebar', 'erus-stip', 'erus-logout-modal', 'erus-pref-modal', 'global-loader'].indexOf(el.id) !== -1) return false;
        if (el.matches('.side-menu, .side-menu-trigger, .modal, .modal-bg, .modal-overlay, .toast, .toast-container, .overlay, .dim-layer, .loading-screen')) return false;
        if (el.id && /toast|suggestions|modal|overlay|loader/i.test(el.id)) return false;
        return true;
    }

    function getSidebarOffsetTargets() {
        var targets = [];
        var directChildren = Array.from(document.body.children).filter(isSidebarOffsetCandidate);
        var wrapperSelector = '.app-layout, .main-layout, .page-wrapper, .main-container, .dashboard-content, .content-area, .app-shell, .app-content, .kanban-container, .container, main';

        directChildren.forEach(function(el) {
            if (el.matches(wrapperSelector)) targets.push(el);
        });

        if (!targets.length) {
            var nested = document.querySelector(wrapperSelector);
            if (nested && isSidebarOffsetCandidate(nested)) targets.push(nested);
        }

        if (targets.length === 1 && targets[0].tagName === 'MAIN') {
            directChildren.forEach(function(el) {
                if (el.tagName === 'HEADER') targets.push(el);
            });
        }

        return targets;
    }

    function applySidebarContentOffset() {
        var targets = getSidebarOffsetTargets();
        document.querySelectorAll('.erus-sidebar-content-offset').forEach(function(el) {
            if (targets.indexOf(el) === -1) {
                el.classList.remove('erus-sidebar-content-offset', 'erus-fixed-layout', 'erus-absolute-layout', 'erus-fill-layout');
            }
        });

        targets.forEach(function(el) {
            var pos = window.getComputedStyle(el).position;
            var isFullLayout = el.dataset.erusFullLayout === '1' || (pos !== 'fixed' && pos !== 'absolute' && el.getBoundingClientRect().width >= window.innerWidth - 2);
            if (isFullLayout) el.dataset.erusFullLayout = '1';
            el.classList.add('erus-sidebar-content-offset');
            el.classList.toggle('erus-fixed-layout', pos === 'fixed');
            el.classList.toggle('erus-absolute-layout', pos === 'absolute');
            el.classList.toggle('erus-fill-layout', isFullLayout && pos !== 'fixed' && pos !== 'absolute');
        });
    }

    function init() {
        if (document.getElementById('erus-sidebar')) return;
        document.body.classList.add('erus-shared-sidebar-active');
        ensureLateMobileStyles();

        // Inject sidebar
        document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
        var pendingSidebarEl = document.getElementById('erus-sidebar');
        if (pendingSidebarEl) pendingSidebarEl.classList.add('erus-sidebar-pending');
        if (!hideMobileMenuButton) document.body.insertAdjacentHTML('afterbegin', mobileSidebarHTML);
        // Inject modals at end
        document.body.insertAdjacentHTML('beforeend', logoutModalHTML);
        document.body.insertAdjacentHTML('beforeend', prefsModalHTML);

        var isIndex = currentPage === 'index.html';
        if (isIndex) {
            document.body.classList.add('erus-is-index');
            document.body.classList.remove('erus-sidebar-collapsed');
        } else {
            document.body.classList.add('erus-sidebar-collapsed');
        }
        syncResponsiveSidebarState();
        applySidebarContentOffset();

        var sidebarEl = document.getElementById('erus-sidebar');
        if (sidebarEl) {
            ['selectstart', 'dragstart'].forEach(function(eventName) {
                sidebarEl.addEventListener(eventName, function(e) {
                    e.preventDefault();
                    return false;
                });
            });
            sidebarEl.addEventListener('mouseup', function() {
                var sel = window.getSelection && window.getSelection();
                if (sel && sel.removeAllRanges) sel.removeAllRanges();
            });
        }

        // Brand click = toggle collapse
        var brandEl = document.getElementById('erus-brand');
        if (brandEl && !isIndex) {
            brandEl.addEventListener('click', function(e) {
                if (isMobileSidebar()) return;
                e.preventDefault();
                document.body.classList.toggle('erus-sidebar-collapsed');
                applySidebarContentOffset();
            });
        }

        var mobileBtn = document.getElementById('erus-mobile-menu-btn');
        var mobileScrim = document.getElementById('erus-sidebar-scrim');
        if (mobileBtn) {
            mobileBtn.addEventListener('click', function() {
                setMobileSidebarOpen(!document.body.classList.contains('erus-mobile-sidebar-open'));
            });
        }
        if (mobileScrim) {
            mobileScrim.addEventListener('click', function() {
                setMobileSidebarOpen(false);
            });
        }

        if (!isIndex) {
            document.addEventListener('click', function(e) {
                if (isMobileSidebar()) return;
                if (document.body.classList.contains('erus-sidebar-collapsed')) return;
                if (e.target.closest && e.target.closest('#erus-sidebar')) return;
                document.body.classList.add('erus-sidebar-collapsed');
                applySidebarContentOffset();
            });
        }

        document.querySelectorAll('#erus-sidebar a').forEach(function(link) {
            link.addEventListener('click', function() {
                if (isMobileSidebar()) setMobileSidebarOpen(false);
            });
        });

        window.addEventListener('resize', function() {
            syncResponsiveSidebarState();
            applySidebarContentOffset();
        });

        // ESC closes pref/logout modals
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            if (document.body.classList.contains('erus-mobile-sidebar-open')) { setMobileSidebarOpen(false); return; }
            var pref = document.getElementById('erus-pref-modal');
            if (pref && pref.classList.contains('open')) { pref.classList.remove('open'); return; }
            var logout = document.getElementById('erus-logout-modal');
            if (logout && logout.classList.contains('open')) { logout.classList.remove('open'); }
        });

        // Role-based visibility
        var role = (localStorage.getItem('erus_role') || '').toLowerCase();
        var stripAccents = function(s) { return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
        var roleNorm = stripAccents(role);
        var isPrivilegedRole = roleNorm === 'desenvolvedor' || roleNorm === 'admin';
        var getSidebarPageKey = function(link) {
            if (!link) return '';
            var key = link.getAttribute('data-page-key');
            if (key) return key;
            var href = link.getAttribute('href') || '';
            if (!href || href === '#') return '';
            return href.split('')[0].split('#')[0];
        };
        var adminBtn = document.getElementById('erus-admin-btn');
        if (adminBtn) adminBtn.style.display = 'none';

        // CLASSIC THEME CHIP — apenas desenvolvedor
        if (role === 'desenvolvedor') {
            var chipClassic = document.getElementById('erus-chip-classic');
            if (chipClassic) chipClassic.style.display = 'flex';
        }

        // Financeiro, Organizacao e Painel TI seguem as permissões de role (painel admin)

        var restrictedPageMap = {};
        if (restrictedPageMap[roleNorm]) {
            var allowedPages = restrictedPageMap[roleNorm];
            // Hide all groups — except eg-chamados which is visible to everyone
            document.querySelectorAll('#erus-sidebar .erus-nav-group-sep, #erus-sidebar .erus-nav-group-wrapper').forEach(function(el) {
                if (el.id === 'eg-chamados') return;
                // The sep immediately before eg-chamados — keep it too (checked below)
                el.classList.add('erus-role-hidden');
            });
            // Un-hide the Chamados TI separator (it has no id, so find it via the wrapper's previousElementSibling)
            var chamadosWrapper = document.getElementById('eg-chamados');
            if (chamadosWrapper) {
                var chamadosSep = chamadosWrapper.previousElementSibling;
                while (chamadosSep && !chamadosSep.classList.contains('erus-nav-group-sep')) {
                    chamadosSep = chamadosSep.previousElementSibling;
                }
                if (chamadosSep) chamadosSep.classList.remove('erus-role-hidden');
            }
            // Show only the groups containing the allowed pages
            allowedPages.forEach(function(allowedPage) {
                var allowedLink = document.querySelector('#erus-sidebar .erus-nav-link[href="' + allowedPage + '"]');
                if (!allowedLink) return;
                allowedLink.classList.remove('erus-role-hidden');
                var parentGroup = allowedLink.closest('.erus-nav-group-wrapper');
                if (parentGroup) {
                    parentGroup.classList.remove('erus-role-hidden');
                    var prevSep = parentGroup.previousElementSibling;
                    while (prevSep && !prevSep.classList.contains('erus-nav-group-sep')) {
                        prevSep = prevSep.previousElementSibling;
                    }
                    if (prevSep) prevSep.classList.remove('erus-role-hidden');
                    // Hide other links in the same group
                    parentGroup.querySelectorAll('.erus-nav-link').forEach(function(link) {
                        if (allowedPages.indexOf(getSidebarPageKey(link)) === -1) link.classList.add('erus-role-hidden');
                    });
                }
            });
        }

        erusSidebarUpdateThemeUI();

        // Collapsed sidebar — floating tooltip
        var stipEl = document.createElement('div');
        stipEl.id = 'erus-stip';
        document.body.appendChild(stipEl);
        var sidebarEl = document.getElementById('erus-sidebar');
        if (sidebarEl) {
            sidebarEl.addEventListener('mouseover', function(e) {
                if (!document.body.classList.contains('erus-sidebar-collapsed')) { stipEl.style.display = 'none'; return; }
                var target = e.target.closest('[data-stip]');
                if (!target) { stipEl.style.display = 'none'; return; }
                var rect = target.getBoundingClientRect();
                stipEl.textContent = target.getAttribute('data-stip');
                stipEl.style.display = 'block';
                stipEl.style.top = Math.round(rect.top + rect.height / 2) + 'px';
                stipEl.style.left = Math.round(rect.right + 10) + 'px';
                stipEl.style.transform = 'translateY(-50%)';
            });
            sidebarEl.addEventListener('mouseleave', function() { stipEl.style.display = 'none'; });
            sidebarEl.addEventListener('mouseout', function(e) {
                if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#erus-sidebar')) return;
                stipEl.style.display = 'none';
            });
        }

        // Highlight the group separator icon for the active page (no expand)
        var activeLink = document.querySelector('#erus-sidebar .erus-nav-link.active');
        if (activeLink) {
            var parentGroup = activeLink.closest('.erus-nav-group-wrapper');
            if (parentGroup) {
                parentGroup.classList.remove('collapsed');
                var activeIcon = document.getElementById('icon-' + parentGroup.id);
                if (activeIcon) {
                    activeIcon.classList.remove('fa-plus');
                    activeIcon.classList.add('fa-minus');
                }
                var sep = parentGroup.previousElementSibling;
                while (sep && !sep.classList.contains('erus-nav-group-sep')) {
                    sep = sep.previousElementSibling;
                }
                if (sep) sep.classList.add('active-group');
            }
        }

        // Load page-locks and permissions together, apply group-hiding after both finish
        var pageLocksPromise = fetch('/api/page-locks')
            .then(function(r) { return r.json(); })
            .then(function(result) {
                if (!result.success) return;
                var blocked = {};
                result.data.forEach(function(l) {
                    if (l.is_locked) blocked[l.page_id] = true;
                    var isDevelopment = l.is_locked && l.lock_reason === 'development';
                    if (l.is_locked && (isDevelopment || !isPrivilegedRole)) {
                        var blockedLink = document.querySelector('#erus-sidebar .erus-nav-link[href="' + l.page_id + '"]');
                        if (!blockedLink) blockedLink = document.querySelector('#erus-sidebar .erus-nav-link[data-page-key="' + l.page_id + '"]');
                        if (blockedLink) blockedLink.classList.add('erus-role-hidden');
                    }
                });
                if (restrictedPageMap[roleNorm]) {
                    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
                    if (blocked[currentPage]) {
                        var fallback = restrictedPageMap[roleNorm].find(function(page) { return !blocked[page]; }) || 'index.html';
                        window.location.href = fallback;
                    }
                } else if (!isPrivilegedRole) {
                    var lockedCurrentPage = window.location.pathname.split('/').pop() || 'index.html';
                    if (blocked[lockedCurrentPage]) window.location.href = 'index.html';
                }
            })
            .catch(function() {});

        var permissionsPromise = Promise.resolve();
        if (role !== 'desenvolvedor') {
            var blocked = {};
            permissionsPromise = fetch('/api/permissions')
                .then(function(r) { return r.json(); })
                .then(function(rows) {
                    rows.forEach(function(r2) {
                        if (stripAccents((r2.role || '').toLowerCase()) !== roleNorm) return;
                        var isBlocked = (r2.allowed === false || r2.allowed === 'false' || r2.allowed === 'f' || r2.allowed === 0);
                        if (isBlocked) blocked[r2.page_key] = true;
                    });
                    Object.keys(blocked).forEach(function(pageKey) {
                        var link = document.querySelector('#erus-sidebar .erus-nav-link[href="' + pageKey + '"]');
                        if (!link) link = document.querySelector('#erus-sidebar .erus-nav-link[data-page-key="' + pageKey + '"]');
                        if (link) link.classList.add('erus-role-hidden');
                    });
                    // Redirect if current page is blocked
                    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
                    if (blocked[currentPage]) window.location.href = 'index.html';
                })
                .catch(function() {});
        }

        // After BOTH fetches complete, hide groups whose links are all blocked
        // (page-locks may have moved links between groups, so we must wait for both)
        Promise.all([pageLocksPromise, permissionsPromise]).then(function() {
            document.querySelectorAll('#erus-sidebar .erus-nav-group-wrapper').forEach(function(wrapper) {
                var links = wrapper.querySelectorAll('.erus-nav-link');
                // Hide if empty (links moved away by page-locks) OR all links are blocked
                var allHidden = links.length === 0 || Array.from(links).every(function(l) {
                    return l.classList.contains('erus-role-hidden') || l.style.display === 'none';
                });
                if (allHidden) {
                    wrapper.style.setProperty('display', 'none', 'important');
                    var sep = wrapper.previousElementSibling;
                    while (sep && !sep.classList.contains('erus-nav-group-sep')) sep = sep.previousElementSibling;
                    if (sep) sep.style.setProperty('display', 'none', 'important');
                }
            });
        }).catch(function() {}).then(function() {
            var sidebarReadyEl = document.getElementById('erus-sidebar');
            if (sidebarReadyEl) sidebarReadyEl.classList.remove('erus-sidebar-pending');
        });
    }

    // ---- Global sidebar functions ----
    window.erusSidebarToggleGroup = function(id) {
        var isCollapsed = document.body.classList.contains('erus-sidebar-collapsed') && !isMobileSidebar();
        var group = document.getElementById(id);
        var icon = document.getElementById('icon-' + id);
        if (isCollapsed) {
            document.body.classList.remove('erus-sidebar-collapsed');
            applySidebarContentOffset();
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

    window.erusSidebarOpenLogout = async function() {
        await ensureConfirmDialog();
        if (!window.erusConfirm) {
            erusSidebarDoLogout();
            return;
        }
        if (await erusConfirm('Sua sessão no sistema será encerrada.', { title: 'Deseja realmente sair?', okText: 'Sim, sair', variant: 'danger', icon: 'fa-solid fa-right-from-bracket' })) {
            erusSidebarDoLogout();
        }
    };

    window.erusSidebarDoLogout = function() {
        try {
            var payload = JSON.stringify({
                user_name: localStorage.getItem('erus_user') || localStorage.getItem('erus_username') || 'Visitante',
                action: 'LOGOUT',
                table_name: window.location.pathname.split('/').pop() || 'index.html',
                details: { origem: 'sidebar' }
            });
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/audit-logger/log', new Blob([payload], { type: 'application/json' }));
            } else if (window.erusAudit) {
                window.erusAudit('LOGOUT', { origem: 'sidebar' });
            }
        } catch (e) {}
        var modal = document.getElementById('erus-logout-modal');
        if (modal) modal.classList.remove('open');
        var ov = document.createElement('div');
        ov.id = 'erus-logout-overlay';
        ov.innerHTML = '<div class="erus-lo-spinner"></div><div class="erus-lo-text">Encerrando sessão...</div>';
        document.body.appendChild(ov);
        requestAnimationFrame(function() { ov.classList.add('show'); });
        localStorage.removeItem('erus_token');
        localStorage.removeItem('erus_role');
        localStorage.removeItem('erus_user');
        setTimeout(function() { window.location.href = 'login.html'; }, 800);
    };

    window.erusSidebarOpenPrefs = function() {
        document.getElementById('erus-pref-modal').classList.add('open');
        erusSidebarUpdateThemeUI();
    };

    window.erusSidebarOpenAdmin = function() {
        if (typeof openAdminModal === 'function') openAdminModal();
        else window.location.href = 'chamados.html';
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
        var role = (localStorage.getItem('erus_role') || '').toLowerCase();
        var next;
        if (role === 'desenvolvedor') {
            next = current === 'dark' ? 'light' : current === 'light' ? 'classic' : 'dark';
        } else {
            next = current === 'dark' ? 'light' : 'dark';
        }
        erusSidebarSetTheme(next);
    };

    window.erusSidebarSetTheme = function(theme) {
        var anterior = localStorage.getItem('erus_theme') || 'dark';
        localStorage.setItem('erus_theme', theme);
        if (typeof ErusTheme !== 'undefined') ErusTheme.apply(theme);
        else document.documentElement.setAttribute('data-theme', theme);
        erusSidebarUpdateThemeUI();
        if (theme !== anterior && window.erusAudit) {
            var nomes = { dark: 'Escuro', light: 'Claro', classic: 'Clássico' };
            window.erusAudit('TROCAR_TEMA', { de: nomes[anterior] || anterior, para: nomes[theme] || theme });
        }
    };

    window.erusSidebarUpdateThemeUI = function() {
        var theme = localStorage.getItem('erus_theme') || 'dark';
        var btn = document.getElementById('erus-theme-btn');
        var chipDark    = document.getElementById('erus-chip-dark');
        var chipLight   = document.getElementById('erus-chip-light');
        var chipClassic = document.getElementById('erus-chip-classic');
        if (btn) {
            var icon = btn.querySelector('i');
            var label = btn.querySelector('span');
            if (theme === 'light') {
                if (icon) icon.className = 'fa-solid fa-moon';
                if (label) label.textContent = 'Tema Escuro';
                btn.style.borderColor = 'rgba(79,70,229,0.35)';
                btn.style.background = 'rgba(79,70,229,0.12)';
                btn.style.color = '#4f46e5';
            } else if (theme === 'classic') {
                if (icon) icon.className = 'fa-solid fa-desktop';
                if (label) label.textContent = 'Clássico';
                btn.style.borderColor = 'rgba(0,0,128,0.4)';
                btn.style.background = 'rgba(0,0,128,0.1)';
                btn.style.color = '#000080';
            } else {
                if (icon) icon.className = 'fa-solid fa-sun';
                if (label) label.textContent = 'Tema Claro';
                btn.style.borderColor = 'rgba(217,119,6,0.25)';
                btn.style.background = 'rgba(217,119,6,0.08)';
                btn.style.color = '#d97706';
            }
        }
        if (chipDark)    chipDark.style.borderColor    = theme === 'dark'     ? '#fbbf24' : 'transparent';
        if (chipLight)   chipLight.style.borderColor   = theme === 'light'    ? '#d97706' : 'transparent';
        if (chipClassic) chipClassic.style.borderColor = theme === 'classic'  ? '#000080' : 'transparent';
        if (chipClassic && theme === 'classic') {
            chipClassic.style.borderTop    = '2px solid ' + (theme === 'classic'  ? '#000080' : '#fff');
            chipClassic.style.borderLeft   = '2px solid ' + (theme === 'classic'  ? '#000080' : '#fff');
            chipClassic.style.borderRight  = '2px solid ' + (theme === 'classic'  ? '#000040' : '#808080');
            chipClassic.style.borderBottom = '2px solid ' + (theme === 'classic'  ? '#000040' : '#808080');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
