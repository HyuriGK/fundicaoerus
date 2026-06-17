(function () {
    var active = null;
    var previousFocus = null;

    function injectStyles() {
        if (document.getElementById('erus-confirm-style')) return;
        var style = document.createElement('style');
        style.id = 'erus-confirm-style';
        style.textContent = [
            '@keyframes erusConfirmFade{from{opacity:0}to{opacity:1}}',
            '@keyframes erusConfirmPop{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}',
            '.erus-confirm-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(3,3,5,.68);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);animation:erusConfirmFade .18s ease-out;}',
            '.erus-confirm-card{width:min(440px,calc(100vw - 32px));min-height:242px;background:linear-gradient(180deg,rgba(24,24,27,.98),rgba(10,10,12,.98));border:1px solid rgba(255,255,255,.1);border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.72),0 0 0 1px rgba(251,191,36,.05) inset;display:flex;flex-direction:column;overflow:hidden;animation:erusConfirmPop .22s cubic-bezier(.16,1,.3,1);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fafafa;}',
            '.erus-confirm-top{height:4px;background:linear-gradient(90deg,#fbbf24,#ef4444,#6366f1);opacity:.9;}',
            '.erus-confirm-body{padding:28px 30px 22px;display:grid;grid-template-columns:52px 1fr;gap:16px;flex:1;}',
            '.erus-confirm-icon{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.24);color:#fbbf24;font-size:1.25rem;box-shadow:0 0 26px rgba(251,191,36,.08);}',
            '.erus-confirm-card.is-danger .erus-confirm-icon{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.26);color:#ef4444;box-shadow:0 0 26px rgba(239,68,68,.08);}',
            '.erus-confirm-card.is-success .erus-confirm-icon{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.26);color:#10b981;box-shadow:0 0 26px rgba(16,185,129,.08);}',
            '.erus-confirm-copy{min-width:0;padding-top:1px;}',
            '.erus-confirm-title{margin:0 0 8px;font-size:1.12rem;line-height:1.25;font-weight:800;letter-spacing:0;color:#fafafa;}',
            '.erus-confirm-message{margin:0;color:#a1a1aa;font-size:.91rem;line-height:1.55;white-space:pre-wrap;word-break:break-word;}',
            '.erus-confirm-actions{display:flex;gap:10px;padding:0 30px 26px;}',
            '.erus-confirm-btn{height:42px;flex:1;border-radius:10px;border:1px solid rgba(255,255,255,.1);font-family:inherit;font-size:.86rem;font-weight:750;cursor:pointer;transition:transform .14s ease,background .14s ease,border-color .14s ease,box-shadow .14s ease;color:#f4f4f5;}',
            '.erus-confirm-btn:hover{transform:translateY(-1px)}',
            '.erus-confirm-btn:active{transform:translateY(0)}',
            '.erus-confirm-btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(251,191,36,.18)}',
            '.erus-confirm-cancel{background:rgba(255,255,255,.055)}',
            '.erus-confirm-cancel:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.16)}',
            '.erus-confirm-ok{background:linear-gradient(180deg,#f59e0b,#d97706);border-color:rgba(251,191,36,.35);color:#0a0a0c;box-shadow:0 12px 24px rgba(217,119,6,.18)}',
            '.erus-confirm-card.is-danger .erus-confirm-ok{background:linear-gradient(180deg,#ef4444,#b91c1c);border-color:rgba(239,68,68,.35);color:#fff;box-shadow:0 12px 24px rgba(239,68,68,.2)}',
            '.erus-confirm-card.is-success .erus-confirm-ok{background:linear-gradient(180deg,#10b981,#047857);border-color:rgba(16,185,129,.35);color:#fff;box-shadow:0 12px 24px rgba(16,185,129,.18)}',
            '@media(max-width:520px){.erus-confirm-overlay{padding:16px}.erus-confirm-card{width:100%;min-height:230px}.erus-confirm-body{grid-template-columns:1fr;padding:24px 22px 18px;text-align:center}.erus-confirm-icon{margin:0 auto}.erus-confirm-actions{padding:0 22px 22px;flex-direction:column-reverse}.erus-confirm-btn{width:100%}}'
        ].join('');
        document.head.appendChild(style);
    }

    function inferVariant(message, opts) {
        if (opts.variant) return opts.variant;
        var text = String((opts.title || '') + ' ' + (message || '') + ' ' + (opts.okText || '')).toLowerCase();
        if (/excluir|remover|banir|bloquear|apagar|resetar|logout|sair|desconectar/.test(text)) return 'danger';
        if (/aprovar|conceder|confirmar vínculo|confirmar vinculo/.test(text)) return 'success';
        return 'default';
    }

    function iconFor(variant) {
        if (variant === 'danger') return 'fa-solid fa-triangle-exclamation';
        if (variant === 'success') return 'fa-solid fa-circle-check';
        return 'fa-solid fa-circle-question';
    }

    function closeActive(value) {
        if (!active) return;
        var current = active;
        active = null;
        document.removeEventListener('keydown', current.onKey, true);
        if (current.overlay.parentNode) current.overlay.parentNode.removeChild(current.overlay);
        if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
        current.resolve(value);
    }

    window.erusConfirm = function (message, options) {
        var opts = options || {};
        injectStyles();
        if (active) closeActive(false);
        previousFocus = document.activeElement;

        return new Promise(function (resolve) {
            var variant = inferVariant(message, opts);
            var overlay = document.createElement('div');
            overlay.className = 'erus-confirm-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');

            var card = document.createElement('div');
            card.className = 'erus-confirm-card is-' + variant;
            card.innerHTML = [
                '<div class="erus-confirm-top"></div>',
                '<div class="erus-confirm-body">',
                '  <div class="erus-confirm-icon"><i></i></div>',
                '  <div class="erus-confirm-copy">',
                '    <h2 class="erus-confirm-title"></h2>',
                '    <p class="erus-confirm-message"></p>',
                '  </div>',
                '</div>',
                '<div class="erus-confirm-actions">',
                '  <button type="button" class="erus-confirm-btn erus-confirm-cancel"></button>',
                '  <button type="button" class="erus-confirm-btn erus-confirm-ok"></button>',
                '</div>'
            ].join('');

            card.querySelector('i').className = opts.icon || iconFor(variant);
            card.querySelector('.erus-confirm-title').textContent = opts.title || 'Confirmar ação';
            card.querySelector('.erus-confirm-message').textContent = String(message || 'Deseja continuar com esta ação?');
            var cancelBtn = card.querySelector('.erus-confirm-cancel');
            var okBtn = card.querySelector('.erus-confirm-ok');
            cancelBtn.textContent = opts.cancelText || 'Cancelar';
            okBtn.textContent = opts.okText || 'Confirmar';

            overlay.appendChild(card);
            document.body.appendChild(overlay);

            var onKey = function (event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeActive(false);
                } else if (event.key === 'Enter') {
                    event.preventDefault();
                    closeActive(true);
                }
            };

            active = { overlay: overlay, resolve: resolve, onKey: onKey };
            document.addEventListener('keydown', onKey, true);
            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) closeActive(false);
            });
            cancelBtn.addEventListener('click', function () { closeActive(false); });
            okBtn.addEventListener('click', function () { closeActive(true); });
            setTimeout(function () { okBtn.focus({ preventScroll: true }); }, 30);
        });
    };

    window.classicConfirm = function (message, title) {
        return window.erusConfirm(message, { title: title || 'Confirmar ação' });
    };

    window.confirmDialog = function (message, options) {
        return window.erusConfirm(message, options || {});
    };
})();
