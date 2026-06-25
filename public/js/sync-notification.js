(function () {
    const pathname = window.location.pathname;
    const PAGE_ID = pathname.split('/').filter(Boolean).pop() || '';
    if (!PAGE_ID || !PAGE_ID.endsWith('.html')) return;

    const style = document.createElement('style');
    style.textContent = `
        #sync-notif {
            position: fixed; bottom: 20px; right: 20px; z-index: 99999;
            background: #18181b; border: 1px solid rgba(161,161,170,0.2);
            border-radius: 14px; padding: 14px 16px 12px; width: 228px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            display: none; opacity: 0; transition: opacity 0.35s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #sync-notif.sync-notif-visible { opacity: 1; }
        #sync-notif-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        #sync-notif-spinner {
            width: 15px; height: 15px; flex-shrink: 0;
            border: 2px solid rgba(161,161,170,0.2); border-top-color: #a1a1aa;
            border-radius: 50%; animation: _sync-spin 0.75s linear infinite;
        }
        @keyframes _sync-spin { to { transform: rotate(360deg); } }
        #sync-notif-label { font-size: 0.77rem; font-weight: 600; color: #e4e4e7; letter-spacing: 0.01em; }
        #sync-notif-track { background: rgba(255,255,255,0.08); border-radius: 4px; height: 4px; overflow: hidden; }
        #sync-notif-bar {
            height: 100%; width: 0%;
            background: linear-gradient(90deg, #71717a, #a1a1aa);
            border-radius: 4px; transition: width 0.6s ease;
        }
        #sync-notif-pct { text-align: right; font-size: 0.71rem; color: #71717a; margin-top: 5px; }
    `;
    document.head.appendChild(style);

    const popup = document.createElement('div');
    popup.id = 'sync-notif';
    popup.innerHTML = `
        <div id="sync-notif-header">
            <div id="sync-notif-spinner"></div>
            <span id="sync-notif-label">Sincronizando dados...</span>
        </div>
        <div id="sync-notif-track"><div id="sync-notif-bar"></div></div>
        <div id="sync-notif-pct">0%</div>
    `;
    document.body.appendChild(popup);

    const bar = document.getElementById('sync-notif-bar');
    const pctEl = document.getElementById('sync-notif-pct');
    let wasLocked = false;
    let completionTimer = null;

    function setProgress(pct) {
        bar.style.width = pct + '%';
        pctEl.textContent = pct + '%';
    }

    function show() {
        clearTimeout(completionTimer);
        popup.style.display = 'block';
        requestAnimationFrame(() => popup.classList.add('sync-notif-visible'));
    }

    function hide() {
        popup.classList.remove('sync-notif-visible');
        completionTimer = setTimeout(() => { popup.style.display = 'none'; }, 400);
    }

    function poll() {
        fetch('/api/page-locks')
            .then(r => r.json())
            .then(data => {
                const lock = (data.data || []).find(l => l.page_id === PAGE_ID && l.is_syncing);
                if (lock) {
                    wasLocked = true;
                    show();
                    const realPct = lock.sync_progress != null ? lock.sync_progress : 0;
                    if (realPct > 0) {
                        setProgress(Math.min(95, realPct));
                    } else {
                        const started = lock.sync_started_at ? new Date(lock.sync_started_at).getTime() : Date.now();
                        const estimated = lock.sync_estimated_ms || 120000;
                        const elapsed = Date.now() - started;
                        setProgress(Math.min(30, Math.round((elapsed / estimated) * 100)));
                    }
                } else if (wasLocked) {
                    wasLocked = false;
                    setProgress(100);
                    completionTimer = setTimeout(hide, 1800);
                }
            })
            .catch(() => {});
    }

    poll();
    setInterval(poll, 3000);
})();
