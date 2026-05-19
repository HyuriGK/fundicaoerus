/**
 * ERUS Classic Dialog — Windows 98-style alert / confirm / prompt
 * Activated only when data-theme="classic".
 * Exposes: window.classicAlert(msg, title)       → Promise<void>
 *          window.classicConfirm(msg, title)      → Promise<boolean>
 *          window.classicPrompt(msg, def, title)  → Promise<string|null>
 * Also overrides window.alert (fire-and-forget, safe).
 */
(function () {
    var _nativeAlert   = window.alert.bind(window);
    var _nativeConfirm = window.confirm.bind(window);
    var _nativePrompt  = window.prompt.bind(window);

    window._nativeAlert   = _nativeAlert;
    window._nativeConfirm = _nativeConfirm;
    window._nativePrompt  = _nativePrompt;

    function isClassic() {
        return (localStorage.getItem('erus_theme') || 'dark') === 'classic';
    }

    /* ---- shared CSS injected once ---- */
    var _cssInjected = false;
    function injectCSS() {
        if (_cssInjected) return;
        _cssInjected = true;
        var s = document.createElement('style');
        s.textContent = [
            '@keyframes erus-dlg-in {',
            '  from { transform: scale(0.92) translateY(-8px); opacity:0; }',
            '  to   { transform: scale(1)    translateY(0);    opacity:1; }',
            '}',
            '.erus-dlg-overlay {',
            '  position:fixed; inset:0; z-index:2147483647;',
            '  background:rgba(0,0,0,0.45);',
            '  display:flex; align-items:center; justify-content:center;',
            '}',
            '.erus-dlg-win {',
            '  background:#d4d0c8;',
            '  border-top:2px solid #ffffff;',
            '  border-left:2px solid #ffffff;',
            '  border-right:2px solid #808080;',
            '  border-bottom:2px solid #808080;',
            '  font-family:Tahoma,Arial,sans-serif;',
            '  font-size:11px; color:#000;',
            '  min-width:300px; max-width:460px; width:auto;',
            '  box-shadow:4px 4px 12px rgba(0,0,0,0.5);',
            '  animation:erus-dlg-in 0.12s ease-out;',
            '  user-select:none;',
            '}',
            '.erus-dlg-titlebar {',
            '  background:linear-gradient(to right,#000080,#1084d0);',
            '  padding:3px 4px 3px 6px;',
            '  display:flex; align-items:center; justify-content:space-between;',
            '  cursor:move;',
            '}',
            '.erus-dlg-titletext {',
            '  display:flex; align-items:center; gap:5px;',
            '  color:#fff; font-weight:bold; font-size:11px;',
            '  white-space:nowrap; overflow:hidden; flex:1;',
            '}',
            '.erus-dlg-closebtn {',
            '  background:#d4d0c8;',
            '  border-top:1px solid #fff; border-left:1px solid #fff;',
            '  border-right:1px solid #808080; border-bottom:1px solid #808080;',
            '  color:#000; width:16px; height:14px; cursor:pointer;',
            '  font-size:9px; padding:0; display:flex;',
            '  align-items:center; justify-content:center;',
            '  font-family:Tahoma,Arial,sans-serif; line-height:1; flex-shrink:0;',
            '}',
            '.erus-dlg-closebtn:hover { background:#c8c4bc; }',
            '.erus-dlg-closebtn:active {',
            '  border-top:1px solid #808080; border-left:1px solid #808080;',
            '  border-right:1px solid #fff; border-bottom:1px solid #fff;',
            '}',
            '.erus-dlg-body {',
            '  padding:16px 20px; display:flex; align-items:flex-start; gap:14px;',
            '}',
            '.erus-dlg-icon { flex-shrink:0; font-size:2rem; }',
            '.erus-dlg-msg {',
            '  flex:1; line-height:1.5; padding-top:4px;',
            '  word-break:break-word; white-space:pre-wrap;',
            '}',
            '.erus-dlg-inputwrap { padding:0 20px 10px; }',
            '.erus-dlg-input {',
            '  width:100%; box-sizing:border-box;',
            '  background:#fff;',
            '  border-top:2px solid #808080; border-left:2px solid #808080;',
            '  border-right:2px solid #fff; border-bottom:2px solid #fff;',
            '  padding:3px 5px; font-family:Tahoma,Arial,sans-serif;',
            '  font-size:11px; color:#000; outline:none;',
            '}',
            '.erus-dlg-footer {',
            '  padding:8px 16px 12px; display:flex;',
            '  justify-content:center; gap:8px;',
            '  border-top:1px solid #808080;',
            '}',
            '.erus-dlg-btn {',
            '  background:#d4d0c8;',
            '  border-top:2px solid #fff; border-left:2px solid #fff;',
            '  border-right:2px solid #808080; border-bottom:2px solid #808080;',
            '  padding:4px 0; cursor:pointer;',
            '  font-family:Tahoma,Arial,sans-serif; font-size:11px;',
            '  min-width:75px; color:#000; outline:none;',
            '}',
            '.erus-dlg-btn:hover { background:#e0ddd6; }',
            '.erus-dlg-btn:active {',
            '  border-top:2px solid #808080; border-left:2px solid #808080;',
            '  border-right:2px solid #fff; border-bottom:2px solid #fff;',
            '}',
            '.erus-dlg-btn:focus {',
            '  outline:1px dotted #000; outline-offset:-3px;',
            '}',
        ].join('');
        document.head.appendChild(s);
    }

    /* ---- drag support ---- */
    function makeDraggable(titlebar, win) {
        var dx = 0, dy = 0, startX = 0, startY = 0;
        titlebar.addEventListener('mousedown', function (e) {
            if (e.target.classList.contains('erus-dlg-closebtn')) return;
            startX = e.clientX - dx;
            startY = e.clientY - dy;
            function move(ev) {
                dx = ev.clientX - startX;
                dy = ev.clientY - startY;
                win.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
                win.style.animation = 'none';
            }
            function up() {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
            }
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
            e.preventDefault();
        });
    }

    /* ---- build window shell ---- */
    function buildWindow(title, iconCls, closeCallback) {
        injectCSS();

        var overlay = document.createElement('div');
        overlay.className = 'erus-dlg-overlay';

        var win = document.createElement('div');
        win.className = 'erus-dlg-win';

        /* title bar */
        var titlebar = document.createElement('div');
        titlebar.className = 'erus-dlg-titlebar';

        var titleText = document.createElement('div');
        titleText.className = 'erus-dlg-titletext';
        var tIcon = document.createElement('i');
        tIcon.className = iconCls;
        tIcon.style.fontSize = '10px';
        var tSpan = document.createElement('span');
        tSpan.textContent = title;
        titleText.appendChild(tIcon);
        titleText.appendChild(tSpan);

        var closeBtn = document.createElement('button');
        closeBtn.className = 'erus-dlg-closebtn';
        closeBtn.setAttribute('aria-label', 'Fechar');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', closeCallback);

        titlebar.appendChild(titleText);
        titlebar.appendChild(closeBtn);
        win.appendChild(titlebar);
        makeDraggable(titlebar, win);

        overlay.appendChild(win);

        function mount()   { document.body.appendChild(overlay); }
        function unmount() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

        return { overlay: overlay, win: win, titlebar: titlebar, mount: mount, unmount: unmount };
    }

    /* ---- body builder ---- */
    function buildBody(msg, iconCls, iconColor) {
        var body = document.createElement('div');
        body.className = 'erus-dlg-body';

        var iconWrap = document.createElement('div');
        iconWrap.className = 'erus-dlg-icon';
        var ic = document.createElement('i');
        ic.className = iconCls;
        ic.style.color = iconColor;
        iconWrap.appendChild(ic);

        var msgDiv = document.createElement('div');
        msgDiv.className = 'erus-dlg-msg';
        msgDiv.textContent = String(msg === undefined || msg === null ? '' : msg);

        body.appendChild(iconWrap);
        body.appendChild(msgDiv);
        return body;
    }

    /* ---- footer builder ---- */
    function buildFooter(buttons) {
        var footer = document.createElement('div');
        footer.className = 'erus-dlg-footer';
        buttons.forEach(function (b) {
            var btn = document.createElement('button');
            btn.className = 'erus-dlg-btn';
            btn.textContent = b.label;
            btn.addEventListener('click', b.action);
            if (b.primary) btn.style.cssText += 'background:#000080;color:#fff;border-top:2px solid #4040c0;border-left:2px solid #4040c0;border-right:2px solid #000040;border-bottom:2px solid #000040;';
            footer.appendChild(btn);
        });
        return { el: footer, buttons: footer.querySelectorAll('.erus-dlg-btn') };
    }

    /* ---- keyboard handler ---- */
    function addKeyHandler(handler) {
        document.addEventListener('keydown', handler);
        return function () { document.removeEventListener('keydown', handler); };
    }

    /* ==================================================================
       PUBLIC API
    ================================================================== */

    window.classicAlert = function (msg, title) {
        return new Promise(function (resolve) {
            if (!isClassic()) { _nativeAlert(msg); resolve(); return; }

            var done = false;
            function close() {
                if (done) return; done = true;
                removeKeys();
                d.unmount();
                resolve();
            }

            var d = buildWindow(title || 'SGP · Erus', 'fa-solid fa-circle-info', close);
            d.win.appendChild(buildBody(msg, 'fa-solid fa-circle-info', '#000080'));

            var f = buildFooter([{ label: 'OK', action: close, primary: false }]);
            d.win.appendChild(f.el);
            d.mount();
            f.buttons[0].focus();

            var removeKeys = addKeyHandler(function (e) {
                if (e.key === 'Enter' || e.key === 'Escape') close();
            });
        });
    };

    window.classicConfirm = function (msg, title) {
        return new Promise(function (resolve) {
            if (!isClassic()) { resolve(_nativeConfirm(msg)); return; }

            var done = false;
            function close(v) {
                if (done) return; done = true;
                removeKeys();
                d.unmount();
                resolve(v);
            }

            var d = buildWindow(title || 'SGP · Erus', 'fa-solid fa-circle-question', function () { close(false); });
            d.win.appendChild(buildBody(msg, 'fa-solid fa-circle-question', '#000080'));

            var f = buildFooter([
                { label: 'OK',       action: function () { close(true);  }, primary: false },
                { label: 'Cancelar', action: function () { close(false); }, primary: false }
            ]);
            d.win.appendChild(f.el);
            d.mount();
            f.buttons[0].focus();

            var removeKeys = addKeyHandler(function (e) {
                if (e.key === 'Enter')  close(true);
                if (e.key === 'Escape') close(false);
            });
        });
    };

    window.classicPrompt = function (msg, defaultVal, title) {
        return new Promise(function (resolve) {
            if (!isClassic()) { resolve(_nativePrompt(msg, defaultVal)); return; }

            var done = false;
            function close(v) {
                if (done) return; done = true;
                d.unmount();
                resolve(v);
            }

            var d = buildWindow(title || 'SGP · Erus', 'fa-solid fa-keyboard', function () { close(null); });
            d.win.appendChild(buildBody(msg, 'fa-solid fa-keyboard', '#000080'));

            var inputWrap = document.createElement('div');
            inputWrap.className = 'erus-dlg-inputwrap';
            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'erus-dlg-input';
            input.value = defaultVal !== undefined && defaultVal !== null ? String(defaultVal) : '';
            inputWrap.appendChild(input);
            d.win.appendChild(inputWrap);

            var f = buildFooter([
                { label: 'OK',       action: function () { close(input.value); }, primary: false },
                { label: 'Cancelar', action: function () { close(null); },        primary: false }
            ]);
            d.win.appendChild(f.el);
            d.mount();
            input.focus();
            input.select();

            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter')  { e.preventDefault(); close(input.value); }
                if (e.key === 'Escape') { e.preventDefault(); close(null); }
            });
        });
    };

    /* Override window.alert — safe (void return, fire-and-forget) */
    window.alert = function (msg) {
        if (isClassic()) {
            window.classicAlert(String(msg === undefined ? '' : msg));
        } else {
            _nativeAlert(msg);
        }
    };

})();
