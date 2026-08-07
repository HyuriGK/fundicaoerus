// public/js/notifications.js

(function() {
    const user = localStorage.getItem('erus_user');
    const role = (localStorage.getItem('erus_role') || '').toLowerCase();
    if (!user) return;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[char]);
    }

    // ─── INJECT UI ────────────────────────────────────────────────────────────
    function injectNotificationUI() {
        if (document.getElementById('notificationsHistoryModal')) return;

        const style = document.createElement('style');
        style.textContent = `
            /* ── FULLSCREEN MODAL ── */
            #notificationsHistoryModal {
                position: fixed; inset: 0;
                background: rgba(0,0,0,0.92);
                backdrop-filter: blur(20px) saturate(1.5);
                -webkit-backdrop-filter: blur(20px) saturate(1.5);
                display: flex; flex-direction: column;
                z-index: 10005;
                opacity: 0; pointer-events: none;
                transition: opacity 0.35s cubic-bezier(0.4,0,0.2,1);
            }
            #notificationsHistoryModal.visible {
                opacity: 1; pointer-events: all;
            }

            /* ── HEADER ── */
            .nhm-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 28px 48px;
                border-bottom: 1px solid rgba(255,255,255,0.06);
                background: linear-gradient(to right, rgba(251,191,36,0.06), transparent 60%);
                flex-shrink: 0;
            }
            .nhm-brand {
                display: flex; align-items: center; gap: 18px;
            }
            .nhm-brand-icon {
                width: 52px; height: 52px;
                background: linear-gradient(135deg, #fbbf24, #d97706);
                border-radius: 14px;
                display: flex; align-items: center; justify-content: center;
                color: #000; font-size: 1.4rem;
                box-shadow: 0 0 24px rgba(251,191,36,0.25);
            }
            .nhm-brand-text h2 {
                margin: 0; font-size: 1.4rem; font-weight: 800;
                color: #fff; letter-spacing: -0.02em;
            }
            .nhm-brand-text p {
                margin: 3px 0 0; font-size: 0.8rem; color: #71717a;
            }
            .nhm-header-actions {
                display: flex; align-items: center; gap: 12px;
            }
            .nhm-badge-count {
                background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.25);
                color: #fbbf24; font-size: 0.75rem; font-weight: 800;
                padding: 4px 12px; border-radius: 20px; letter-spacing: 0.05em;
            }
            .nhm-close-btn {
                width: 40px; height: 40px;
                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                border-radius: 10px; cursor: pointer; color: #71717a;
                display: flex; align-items: center; justify-content: center;
                font-size: 1rem; transition: all 0.2s;
            }
            .nhm-close-btn:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }

            /* ── BODY ── */
            .nhm-body {
                flex: 1; display: flex; overflow: hidden;
            }

            /* ── SIDEBAR ── */
            .nhm-sidebar {
                width: 320px; flex-shrink: 0;
                border-right: 1px solid rgba(255,255,255,0.06);
                overflow-y: auto; padding: 20px 16px;
                background: rgba(9,9,11,0.6);
                display: flex; flex-direction: column; gap: 6px;
            }
            .nhm-sidebar::-webkit-scrollbar { width: 3px; }
            .nhm-sidebar::-webkit-scrollbar-track { background: transparent; }
            .nhm-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

            .nhm-list-item {
                padding: 14px 16px; border-radius: 12px;
                border: 1px solid transparent;
                cursor: pointer; transition: all 0.2s;
                display: flex; flex-direction: column; gap: 4px;
                background: transparent;
            }
            .nhm-list-item:hover {
                background: rgba(255,255,255,0.03);
                border-color: rgba(255,255,255,0.06);
            }
            .nhm-list-item.active {
                background: rgba(251,191,36,0.07);
                border-color: rgba(251,191,36,0.2);
            }
            .nhm-list-item.unread .nhm-item-subject {
                color: #fbbf24;
            }
            .nhm-list-item .nhm-item-subject {
                font-size: 0.9rem; font-weight: 700; color: #e4e4e7;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .nhm-list-item .nhm-item-meta {
                display: flex; align-items: center; gap: 8px;
                font-size: 0.72rem; color: #52525b;
            }
            .nhm-unread-dot {
                width: 6px; height: 6px; border-radius: 50%;
                background: #fbbf24; flex-shrink: 0;
            }

            /* ── CONTENT ── */
            .nhm-content {
                flex: 1; overflow-y: auto; padding: 40px 56px;
            }
            .nhm-content::-webkit-scrollbar { width: 4px; }
            .nhm-content::-webkit-scrollbar-track { background: transparent; }
            .nhm-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 4px; }

            .nhm-empty-state {
                height: 100%; display: flex; flex-direction: column;
                align-items: center; justify-content: center; gap: 16px;
                color: #3f3f46;
            }
            .nhm-empty-state i { font-size: 3rem; opacity: 0.3; }
            .nhm-empty-state p { font-size: 0.95rem; }

            .nhm-msg-header {
                display: flex; align-items: flex-start; justify-content: space-between;
                margin-bottom: 32px; padding-bottom: 24px;
                border-bottom: 1px solid rgba(255,255,255,0.06);
            }
            .nhm-msg-subject {
                font-size: 1.8rem; font-weight: 800; color: #fff;
                letter-spacing: -0.03em; line-height: 1.2; margin-bottom: 10px;
            }
            .nhm-msg-meta {
                display: flex; align-items: center; gap: 16px;
                font-size: 0.8rem; color: #52525b;
            }
            .nhm-msg-meta span { display: flex; align-items: center; gap: 6px; }
            .nhm-msg-meta i { color: #3f3f46; }
            .nhm-msg-body {
                font-size: 1rem; color: #a1a1aa; line-height: 1.85;
                white-space: pre-wrap;
                background: rgba(255,255,255,0.02);
                border: 1px solid rgba(255,255,255,0.05);
                border-radius: 16px; padding: 32px 36px;
                margin-bottom: 32px;
            }
            .nhm-mark-read-btn {
                background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.25);
                color: #fbbf24; padding: 12px 24px; border-radius: 12px;
                font-size: 0.85rem; font-weight: 700; cursor: pointer;
                transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px;
            }
            .nhm-mark-read-btn:hover {
                background: rgba(251,191,36,0.18); border-color: #fbbf24;
            }

            /* ── SIDEBAR LABEL ── */
            .nhm-sidebar-label {
                font-size: 0.65rem; font-weight: 700; color: #3f3f46;
                letter-spacing: 0.12em; text-transform: uppercase;
                padding: 8px 12px 4px;
            }

            /* ── FOOTER ── */
            .nhm-footer {
                padding: 16px 48px;
                border-top: 1px solid rgba(255,255,255,0.06);
                display: flex; align-items: center; justify-content: space-between;
                background: rgba(9,9,11,0.8); flex-shrink: 0;
            }
            .nhm-footer-info { font-size: 0.75rem; color: #3f3f46; }
            .nhm-footer-close {
                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                color: #71717a; padding: 10px 24px; border-radius: 10px;
                font-size: 0.85rem; font-weight: 600; cursor: pointer;
                transition: all 0.2s;
            }
            .nhm-footer-close:hover { background: rgba(255,255,255,0.08); color: #fff; }

            /* ── POPUP OVERRIDE ── */
            @keyframes commFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes commSlideUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
            #comm-popup-modal {
                position: fixed; inset: 0; z-index: 10006;
                display: none; align-items: center; justify-content: center;
                padding: 24px; background: rgba(0,0,0,.82);
                backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                animation: commFadeIn .18s ease;
            }
            .comm-popup-shell {
                width: min(720px, 100%); max-height: min(760px, calc(100vh - 48px));
                display: flex; flex-direction: column; overflow: hidden;
                background: #111114; border: 1px solid rgba(255,255,255,.12);
                border-radius: 8px; box-shadow: 0 28px 80px rgba(0,0,0,.65);
                animation: commSlideUp .25s cubic-bezier(.2,.8,.2,1);
            }
            .comm-popup-header {
                display: grid; grid-template-columns: 44px minmax(0,1fr) 36px;
                align-items: center; gap: 14px; padding: 20px 22px;
                border-bottom: 1px solid rgba(255,255,255,.08); background: #151518;
            }
            .comm-popup-icon {
                width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center;
                border: 1px solid rgba(251,191,36,.35); border-radius: 8px;
                background: rgba(251,191,36,.1); color: #fbbf24; font-size: 1rem;
            }
            .comm-popup-heading { min-width: 0; }
            .comm-popup-kicker { color: #fbbf24; font-size: .68rem; font-weight: 800; text-transform: uppercase; }
            .comm-popup-title {
                margin-top: 4px; color: #f4f4f5; font-size: 1.18rem; font-weight: 750;
                line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .comm-popup-close {
                width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center;
                border: 1px solid rgba(255,255,255,.09); border-radius: 8px;
                background: rgba(255,255,255,.025); color: #a1a1aa; cursor: pointer;
            }
            .comm-popup-close:hover { color: #fff; border-color: rgba(255,255,255,.2); background: rgba(255,255,255,.06); }
            .comm-popup-body { min-height: 0; padding: 24px 26px; overflow-y: auto; }
            .comm-popup-meta {
                display: flex; align-items: center; flex-wrap: wrap; gap: 10px 18px;
                margin-bottom: 20px; color: #71717a; font-size: .78rem;
            }
            .comm-popup-meta span { display: inline-flex; align-items: center; gap: 7px; }
            .comm-popup-meta i { color: #a1a1aa; }
            .comm-popup-sender { color: #d4d4d8; font-weight: 700; }
            .comm-popup-message {
                color: #e4e4e7; font-size: .98rem; line-height: 1.75;
                white-space: pre-wrap; overflow-wrap: anywhere;
            }
            .comm-popup-footer {
                display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px;
                border-top: 1px solid rgba(255,255,255,.08); background: #0f0f12;
            }
            .comm-popup-btn {
                min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
                padding: 10px 18px; border-radius: 8px; font: 700 .82rem Inter, sans-serif; cursor: pointer;
            }
            .comm-popup-btn.secondary { border: 1px solid rgba(255,255,255,.1); background: transparent; color: #a1a1aa; }
            .comm-popup-btn.secondary:hover { border-color: rgba(255,255,255,.2); color: #f4f4f5; background: rgba(255,255,255,.04); }
            .comm-popup-btn.primary { border: 1px solid #fbbf24; background: #fbbf24; color: #111; }
            .comm-popup-btn.primary:hover { background: #f59e0b; border-color: #f59e0b; }
            .comm-popup-btn:disabled { opacity: .55; cursor: wait; }
            @media (max-width: 600px) {
                #comm-popup-modal { padding: 12px; align-items: flex-end; }
                .comm-popup-shell { max-height: calc(100vh - 24px); }
                .comm-popup-header { grid-template-columns: 40px minmax(0,1fr) 34px; padding: 16px; gap: 11px; }
                .comm-popup-icon { width: 40px; height: 40px; }
                .comm-popup-title { font-size: 1rem; }
                .comm-popup-body { padding: 20px 18px; }
                .comm-popup-footer { display: grid; grid-template-columns: 1fr 1fr; padding: 14px 16px; }
                .comm-popup-btn { width: 100%; padding-inline: 10px; }
            }
        `;
        document.head.appendChild(style);

        const modal = document.createElement('div');
        modal.id = 'notificationsHistoryModal';
        modal.innerHTML = `
            <div class="nhm-header">
                <div class="nhm-brand">
                    <div class="nhm-brand-icon"><i class="fa-solid fa-bell"></i></div>
                    <div class="nhm-brand-text">
                        <h2>Central de Notificações</h2>
                        <p>Comunicados e alertas do sistema</p>
                    </div>
                </div>
                <div class="nhm-header-actions">
                    <span class="nhm-badge-count" id="nhm-unread-badge" style="display:none;"></span>
                    <button class="nhm-close-btn" onclick="closeNotificationsModal()" title="Fechar (ESC)">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>

            <div class="nhm-body">
                <div class="nhm-sidebar" id="nhm-sidebar">
                    <div class="nhm-empty-state" id="nhm-sidebar-loading" style="height:auto; padding:40px 0;">
                        <i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem;"></i>
                    </div>
                </div>
                <div class="nhm-content" id="nhm-content">
                    <div class="nhm-empty-state">
                        <i class="fa-solid fa-inbox"></i>
                        <p>Selecione uma notificação</p>
                    </div>
                </div>
            </div>

            <div class="nhm-footer">
                <span class="nhm-footer-info" id="nhm-footer-info">Fundição Erus • SGP</span>
                <button class="nhm-footer-close" onclick="closeNotificationsModal()">Fechar</button>
            </div>
        `;
        document.body.appendChild(modal);

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && modal.classList.contains('visible')) closeNotificationsModal();
        });
    }

    // ─── OPEN ─────────────────────────────────────────────────────────────────
    window.openNotificationsModal = async function() {
        injectNotificationUI();
        const modal    = document.getElementById('notificationsHistoryModal');
        const sidebar  = document.getElementById('nhm-sidebar');
        const content  = document.getElementById('nhm-content');
        const badge    = document.getElementById('nhm-unread-badge');
        const footer   = document.getElementById('nhm-footer-info');
        if (!modal) return;

        modal.classList.add('visible');
        sidebar.innerHTML = `<div class="nhm-empty-state" style="height:auto;padding:40px 0;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem;"></i></div>`;
        content.innerHTML = `<div class="nhm-empty-state"><i class="fa-solid fa-inbox"></i><p>Selecione uma notificação</p></div>`;

        try {
            const res  = await fetch('/api/communications/history', { headers: { 'x-user': user } });
            const data = await res.json();

            if (!data.success || !data.history || data.history.length === 0) {
                sidebar.innerHTML = `<div class="nhm-empty-state" style="height:auto;padding:60px 0;"><i class="fa-solid fa-bell-slash"></i><p>Nenhuma notificação.</p></div>`;
                return;
            }

            const msgs   = data.history;
            const unread = msgs.filter(m => !m.is_read).length;

            if (unread > 0) {
                badge.textContent = unread + ' não lida' + (unread > 1 ? 's' : '');
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }

            footer.textContent = `${msgs.length} notificação${msgs.length > 1 ? 'ões' : ''} • Fundição Erus`;

            // Build sidebar
            const unreadMsgs = msgs.filter(m => !m.is_read);
            const readMsgs   = msgs.filter(m => m.is_read);

            let sidebarHTML = '';
            if (unreadMsgs.length > 0) {
                sidebarHTML += `<div class="nhm-sidebar-label">Não lidas (${unreadMsgs.length})</div>`;
                sidebarHTML += unreadMsgs.map(m => listItem(m)).join('');
            }
            if (readMsgs.length > 0) {
                sidebarHTML += `<div class="nhm-sidebar-label" style="margin-top:12px;">Lidas</div>`;
                sidebarHTML += readMsgs.map(m => listItem(m)).join('');
            }
            sidebar.innerHTML = sidebarHTML;

            // Click handlers
            sidebar.querySelectorAll('.nhm-list-item').forEach(el => {
                el.addEventListener('click', () => {
                    sidebar.querySelectorAll('.nhm-list-item').forEach(x => x.classList.remove('active'));
                    el.classList.add('active');
                    const id = parseInt(el.dataset.id);
                    const msg = msgs.find(m => m.id === id);
                    if (msg) renderContent(msg, unread);
                });
            });

            // Auto-open first unread or first
            const first = sidebar.querySelector('.nhm-list-item');
            if (first) first.click();

        } catch(e) {
            console.error(e);
            sidebar.innerHTML = `<div class="nhm-empty-state" style="height:auto;padding:40px 0;color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i><p>Erro ao carregar.</p></div>`;
        }
    };

    function listItem(m) {
        const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
        const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
        return `
            <div class="nhm-list-item ${m.is_read ? '' : 'unread'}" data-id="${m.id}">
                <div class="nhm-item-subject">${m.subject || 'Sem Assunto'}</div>
                <div class="nhm-item-meta">
                    ${!m.is_read ? '<span class="nhm-unread-dot"></span>' : ''}
                    <span>${m.sender_name || 'Admin'}</span>
                    <span>•</span>
                    <span>${date}, ${time}</span>
                </div>
            </div>`;
    }

    function renderContent(msg, totalUnread) {
        const content = document.getElementById('nhm-content');
        const date = new Date(msg.created_at).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
        const time = new Date(msg.created_at).toLocaleTimeString('pt-BR');

        content.innerHTML = `
            <div class="nhm-msg-header">
                <div style="flex:1;">
                    <div class="nhm-msg-subject">${msg.subject || 'Sem Assunto'}</div>
                    <div class="nhm-msg-meta">
                        <span><i class="fa-solid fa-user"></i> ${msg.sender_name || 'Admin'}</span>
                        <span><i class="fa-solid fa-calendar"></i> ${date}</span>
                        <span><i class="fa-regular fa-clock"></i> ${time}</span>
                        ${!msg.is_read ? '<span style="color:#fbbf24; font-weight:700;"><i class="fa-solid fa-circle" style="font-size:0.5rem;"></i> Não lida</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="nhm-msg-body">${msg.message}</div>
            ${!msg.is_read ? `
                <button class="nhm-mark-read-btn" onclick="markNotificationRead(${msg.id}, this)">
                    <i class="fa-solid fa-check"></i> Marcar como lida
                </button>
            ` : '<span style="font-size:0.8rem;color:#3f3f46;"><i class="fa-solid fa-check-double"></i> Lida</span>'}
        `;
    }

    // ─── CLOSE ────────────────────────────────────────────────────────────────
    window.closeNotificationsModal = function() {
        const modal = document.getElementById('notificationsHistoryModal');
        if (modal) modal.classList.remove('visible');
    };

    // ─── MARK READ ────────────────────────────────────────────────────────────
    window.markNotificationRead = async function(id, btn) {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...'; }
        try {
            await fetch('/api/communications/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user': user },
                body: JSON.stringify({ message_id: id })
            });
            // Update sidebar item
            const item = document.querySelector(`.nhm-list-item[data-id="${id}"]`);
            if (item) {
                item.classList.remove('unread');
                const dot = item.querySelector('.nhm-unread-dot');
                if (dot) dot.remove();
            }
            if (btn) {
                btn.outerHTML = '<span style="font-size:0.8rem;color:#3f3f46;"><i class="fa-solid fa-check-double"></i> Lida</span>';
            }
            checkNotifications();
        } catch(e) { console.error(e); }
    };

    // ─── BELL / CHECK ─────────────────────────────────────────────────────────
    async function checkNotifications() {
        try {
            const res  = await fetch('/api/communications/unread', { headers: { 'x-user': user } });
            const data = await res.json();
            if (data.success && data.unread.length > 0) {
                updateBell(data.unread.length);
                const isIndex = ['index.html','/','/processos.html'].some(p => window.location.pathname.endsWith(p));
                const lastId  = sessionStorage.getItem('last_comm_popup_id');
                if (isIndex && lastId !== String(data.unread[0].id)) showMessagePopup(data.unread[0]);
            } else {
                updateBell(0);
            }
        } catch(e) {}
    }

    function updateBell(count) {
        const bell  = document.getElementById('notification-bell');
        const badge = document.getElementById('notification-count');
        if (!badge) return;
        if (count > 0) {
            badge.innerText = count; badge.style.display = 'block';
            if (bell) bell.style.animation = 'pulseGlow 2s infinite';
        } else {
            badge.style.display = 'none';
            if (bell) bell.style.animation = 'none';
        }
    }

    function showMessagePopup(msg) {
        let modal = document.getElementById('comm-popup-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'comm-popup-modal';
            document.body.appendChild(modal);
        }
        const createdAt = msg.created_at ? new Date(msg.created_at) : null;
        const validDate = createdAt && !Number.isNaN(createdAt.getTime());
        const dateLabel = validDate
            ? createdAt.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
            : '';
        modal.innerHTML = `
            <section class="comm-popup-shell" role="dialog" aria-modal="true" aria-labelledby="comm-popup-title">
                <header class="comm-popup-header">
                    <div class="comm-popup-icon" aria-hidden="true"><i class="fa-solid fa-bell"></i></div>
                    <div class="comm-popup-heading">
                        <div class="comm-popup-kicker">Comunicado do sistema</div>
                        <div class="comm-popup-title" id="comm-popup-title" title="${escapeHtml(msg.subject || 'Novo comunicado')}">${escapeHtml(msg.subject || 'Novo comunicado')}</div>
                    </div>
                    <button type="button" class="comm-popup-close" id="close-comm-popup" title="Ler mais tarde" aria-label="Fechar comunicado">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </header>
                <div class="comm-popup-body">
                    <div class="comm-popup-meta">
                        <span><i class="fa-solid fa-user"></i> Enviado por <strong class="comm-popup-sender">${escapeHtml(msg.sender_name || 'Administração')}</strong></span>
                        ${dateLabel ? `<span><i class="fa-regular fa-clock"></i> ${escapeHtml(dateLabel)}</span>` : ''}
                    </div>
                    <div class="comm-popup-message">${escapeHtml(msg.message || '')}</div>
                </div>
                <footer class="comm-popup-footer">
                    <button type="button" id="read-later-comm" class="comm-popup-btn secondary"><i class="fa-regular fa-clock"></i> Ler mais tarde</button>
                    <button type="button" id="mark-read-comm" class="comm-popup-btn primary"><i class="fa-solid fa-check"></i> Entendido</button>
                </footer>
            </section>
        `;
        modal.style.display = 'flex';
        const postpone = () => {
            modal.style.display = 'none';
            sessionStorage.setItem('last_comm_popup_id', String(msg.id));
        };
        document.getElementById('read-later-comm').onclick = postpone;
        document.getElementById('close-comm-popup').onclick = postpone;
        modal.onclick = event => {
            if (event.target === modal) postpone();
        };
        modal.onkeydown = event => {
            if (event.key === 'Escape') postpone();
        };
        document.getElementById('mark-read-comm').onclick = async () => {
            const button = document.getElementById('mark-read-comm');
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando';
            try {
                await markNotificationRead(msg.id);
                modal.style.display = 'none';
            } finally {
                button.disabled = false;
            }
        };
        document.getElementById('mark-read-comm').focus({ preventScroll: true });
    }

    // ─── BELL CLICK ───────────────────────────────────────────────────────────
    document.addEventListener('click', e => {
        if (e.target.closest('#notification-bell')) openNotificationsModal();
    });

    checkNotifications();
    setInterval(checkNotifications, 3 * 60 * 1000);
})();
