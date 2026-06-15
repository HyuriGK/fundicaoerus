(function() {
    if (window.ErusUI && window.ErusUI.ready) return;

    var style = document.createElement('style');
    style.id = 'erus-ui-components-css';
    style.textContent = [
        ':root{--erus-ui-bg:#18181b;--erus-ui-border:rgba(255,255,255,.08);--erus-ui-text:#fafafa;--erus-ui-muted:#a1a1aa;--erus-ui-primary:#fbbf24;--erus-ui-danger:#ef4444;--erus-ui-success:#10b981;--erus-ui-info:#3b82f6;--erus-ui-warning:#f59e0b;--erus-ui-ease:cubic-bezier(.16,1,.3,1)}',
        '.erus-btn,.btn-modern{font-family:var(--font-main,Inter,sans-serif)!important;font-weight:600!important;font-size:.82rem!important;border-radius:8px!important;padding:9px 16px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;border:1px solid var(--erus-ui-border)!important;background:rgba(255,255,255,.04)!important;color:var(--erus-ui-text)!important;cursor:pointer!important;transition:background .2s var(--erus-ui-ease),border-color .2s var(--erus-ui-ease),color .2s var(--erus-ui-ease),transform .2s var(--erus-ui-ease)!important;text-decoration:none!important;white-space:nowrap!important;line-height:1.2!important}',
        '.erus-btn:hover,.btn-modern:hover{transform:translateY(-1px)!important;background:rgba(255,255,255,.08)!important;border-color:rgba(255,255,255,.14)!important}',
        '.erus-btn-primary,.btn-modern.btn-add,.btn-modern.btn-success{background:rgba(251,191,36,.12)!important;border-color:rgba(251,191,36,.28)!important;color:var(--erus-ui-primary)!important}',
        '.erus-btn-primary:hover,.btn-modern.btn-add:hover,.btn-modern.btn-success:hover{background:rgba(251,191,36,.2)!important;border-color:rgba(251,191,36,.5)!important}',
        '.erus-btn-danger{background:rgba(239,68,68,.1)!important;border-color:rgba(239,68,68,.28)!important;color:var(--erus-ui-danger)!important}',
        '.erus-btn-danger:hover{background:rgba(239,68,68,.18)!important;border-color:rgba(239,68,68,.5)!important}',
        '.erus-btn-ghost{background:transparent!important;border-color:transparent!important;color:var(--erus-ui-muted)!important}',
        '.erus-btn-icon{width:36px!important;height:36px!important;padding:0!important;min-width:36px!important}',
        '.erus-toast-container{position:fixed;right:22px;bottom:22px;z-index:10050;display:flex;flex-direction:column;gap:10px;pointer-events:none}',
        '.erus-toast{min-width:310px;max-width:430px;background:rgba(24,24,27,.96);border:1px solid var(--erus-ui-border);border-left:4px solid var(--erus-ui-info);border-radius:8px;padding:14px 16px;box-shadow:0 18px 45px rgba(0,0,0,.45);display:flex;align-items:flex-start;gap:12px;color:var(--erus-ui-text);font-family:var(--font-main,Inter,sans-serif);animation:erusToastIn .26s var(--erus-ui-ease) both;pointer-events:auto}',
        '.erus-toast.success{border-left-color:var(--erus-ui-success)}.erus-toast.danger,.erus-toast.error{border-left-color:var(--erus-ui-danger)}.erus-toast.warning{border-left-color:var(--erus-ui-warning)}.erus-toast.info{border-left-color:var(--erus-ui-info)}',
        '.erus-toast-icon{font-size:1rem;margin-top:2px;color:var(--erus-ui-info)}.erus-toast.success .erus-toast-icon{color:var(--erus-ui-success)}.erus-toast.danger .erus-toast-icon,.erus-toast.error .erus-toast-icon{color:var(--erus-ui-danger)}.erus-toast.warning .erus-toast-icon{color:var(--erus-ui-warning)}',
        '.erus-toast-content{display:flex;flex-direction:column;gap:4px;min-width:0}.erus-toast-title{font-size:.9rem;font-weight:800;line-height:1.25}.erus-toast-subtitle{font-size:.76rem;color:var(--erus-ui-muted);line-height:1.35}',
        '.erus-toast-close{margin-left:auto;border:0;background:transparent;color:var(--erus-ui-muted);cursor:pointer;padding:0;font-size:.9rem;line-height:1}.erus-toast-close:hover{color:var(--erus-ui-text)}',
        '@keyframes erusToastIn{from{opacity:0;transform:translateX(18px) scale(.98)}to{opacity:1;transform:none}}@keyframes erusToastOut{to{opacity:0;transform:translateX(18px) scale(.98)}}',
        '.erus-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(8px);z-index:10020;display:none;align-items:center;justify-content:center;padding:24px}',
        '.erus-modal-overlay.open{display:flex;animation:erusFadeIn .2s ease both}.erus-modal-card{width:min(760px,96vw);max-height:90vh;overflow:hidden;background:#18181b;border:1px solid var(--erus-ui-border);border-radius:12px;box-shadow:0 25px 70px rgba(0,0,0,.55);display:flex;flex-direction:column;animation:erusModalIn .26s var(--erus-ui-ease) both}',
        '.erus-modal-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 22px;border-bottom:1px solid rgba(255,255,255,.06)}.erus-modal-title{font-size:1rem;font-weight:800;color:var(--erus-ui-text);margin:0}.erus-modal-body{padding:22px;overflow:auto}.erus-modal-footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid rgba(255,255,255,.06)}',
        '.modal-overlay{backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important;background:rgba(0,0,0,.78)!important}',
        '.modal-card,.modal-content{background:#18181b;border:1px solid var(--erus-ui-border);box-shadow:0 25px 70px rgba(0,0,0,.55)}',
        '.toast-container:not(.erus-toast-container){display:none!important}',
        '@keyframes erusFadeIn{from{opacity:0}to{opacity:1}}@keyframes erusModalIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}'
    ].join('\n');
    if (!document.getElementById(style.id)) document.head.appendChild(style);

    function ensureToastContainer() {
        var c = document.getElementById('erus-toast-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'erus-toast-container';
            c.className = 'erus-toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    function showToast(title, subtitle, type, timeout) {
        var c = ensureToastContainer();
        var t = document.createElement('div');
        type = type || 'info';
        timeout = timeout === undefined ? 3600 : timeout;
        var icon = type === 'success' ? 'fa-circle-check' : type === 'danger' || type === 'error' ? 'fa-circle-exclamation' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info';
        t.className = 'erus-toast ' + type;
        t.innerHTML = '<i class="fa-solid ' + icon + ' erus-toast-icon"></i><div class="erus-toast-content"><div class="erus-toast-title"></div><div class="erus-toast-subtitle"></div></div><button class="erus-toast-close" type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>';
        t.querySelector('.erus-toast-title').textContent = title || '';
        t.querySelector('.erus-toast-subtitle').textContent = subtitle || '';
        t.querySelector('.erus-toast-close').onclick = function() { closeToast(t); };
        c.appendChild(t);
        if (timeout > 0) setTimeout(function() { closeToast(t); }, timeout);
        return t;
    }

    function closeToast(t) {
        if (!t || !t.parentNode) return;
        t.style.animation = 'erusToastOut .22s ease forwards';
        setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 240);
    }

    function openModal(opts) {
        opts = opts || {};
        var overlay = document.createElement('div');
        overlay.className = 'erus-modal-overlay';
        overlay.innerHTML = '<div class="erus-modal-card"><div class="erus-modal-header"><h2 class="erus-modal-title"></h2><button class="erus-btn erus-btn-icon erus-btn-ghost" type="button"><i class="fa-solid fa-xmark"></i></button></div><div class="erus-modal-body"></div><div class="erus-modal-footer"></div></div>';
        overlay.querySelector('.erus-modal-title').textContent = opts.title || '';
        var body = overlay.querySelector('.erus-modal-body');
        if (opts.html) body.innerHTML = opts.html;
        else if (opts.content) body.appendChild(opts.content);
        else body.textContent = opts.message || '';
        var footer = overlay.querySelector('.erus-modal-footer');
        (opts.actions || [{ label: 'Fechar', className: 'erus-btn', close: true }]).forEach(function(a) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = a.className || 'erus-btn';
            b.textContent = a.label || 'OK';
            b.onclick = function() {
                if (typeof a.onClick === 'function') a.onClick(overlay);
                if (a.close !== false) closeModal(overlay);
            };
            footer.appendChild(b);
        });
        overlay.querySelector('.erus-modal-header button').onclick = function() { closeModal(overlay); };
        overlay.addEventListener('click', function(e) { if (e.target === overlay && opts.backdropClose !== false) closeModal(overlay); });
        document.body.appendChild(overlay);
        requestAnimationFrame(function() { overlay.classList.add('open'); });
        return overlay;
    }

    function closeModal(overlay) {
        if (!overlay) return;
        overlay.classList.remove('open');
        setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 180);
    }

    function applyChartDefaults() {
        if (typeof Chart === 'undefined') return;
        Chart.defaults.font.family = "Inter, system-ui, sans-serif";
        Chart.defaults.font.size = 11;
        Chart.defaults.color = window.ErusTheme && ErusTheme.chartColor ? ErusTheme.chartColor() : '#a1a1aa';
        Chart.defaults.borderColor = window.ErusTheme && ErusTheme.chartGridColor ? ErusTheme.chartGridColor() : 'rgba(255,255,255,.05)';
        Chart.defaults.plugins.legend.labels.usePointStyle = true;
        Chart.defaults.plugins.legend.labels.boxWidth = 8;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
        Chart.defaults.plugins.tooltip.padding = 10;
    }

    window.ErusCharts = {
        applyDefaults: applyChartDefaults,
        grid: function() { return window.ErusTheme && ErusTheme.chartGridColor ? ErusTheme.chartGridColor() : 'rgba(255,255,255,.05)'; },
        text: function() { return window.ErusTheme && ErusTheme.chartColor ? ErusTheme.chartColor() : '#a1a1aa'; },
        axis: function(showVertical) {
            return {
                ticks: { color: this.text(), font: { size: 11, family: 'Inter' } },
                grid: { color: this.grid(), drawBorder: false, drawOnChartArea: showVertical !== false }
            };
        }
    };

    window.ErusUI = {
        ready: true,
        toast: showToast,
        modal: openModal,
        closeModal: closeModal,
        chartDefaults: applyChartDefaults
    };
    window.showToast = showToast;
    window.openErusModal = openModal;

    applyChartDefaults();
    function reclaimGlobals() {
        window.showToast = showToast;
        window.openErusModal = openModal;
        applyChartDefaults();
    }
    setTimeout(reclaimGlobals, 0);
    setTimeout(reclaimGlobals, 500);
    window.addEventListener('load', function() { setTimeout(reclaimGlobals, 0); setTimeout(reclaimGlobals, 400); });
})();
