// public/js/notifications.js

(function() {
    const user = localStorage.getItem('erus_user');
    const role = (localStorage.getItem('erus_role') || '').toLowerCase();

    if (!user) return;

    // Elementos da UI
    const bell = document.getElementById('notification-bell');
    const countBadge = document.getElementById('notification-count');

    async function checkNotifications() {
        try {
            const res = await fetch('/api/communications/unread', {
                headers: { 'x-user': user }
            });
            const data = await res.json();

            if (data.success && data.unread.length > 0) {
                updateBell(data.unread.length);
                
                // Mostrar popup apenas se estiver na index.html (evitar spam em todas as subpáginas)
                const isIndexPath = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('processos.html');
                
                // Verifica se já mostramos este popup nesta sessão para evitar re-exibição chata no refresh se clicar em "Ler Mais Tarde"
                const lastPopupId = sessionStorage.getItem('last_comm_popup_id');
                
                if (isIndexPath && lastPopupId !== String(data.unread[0].id)) {
                    showMessagePopup(data.unread[0]); 
                }
            } else {
                updateBell(0);
            }
        } catch (err) {
            console.error('Erro ao buscar notificações:', err);
        }
    }

    function updateBell(count) {
        if (!countBadge) return;
        if (count > 0) {
            countBadge.innerText = count;
            countBadge.style.display = 'block';
            if (bell) bell.style.animation = 'pulseGlow 2s infinite';
        } else {
            countBadge.style.display = 'none';
            if (bell) bell.style.animation = 'none';
        }
    }

    // Modal Global Functions (attached to window for HTML access)
    window.openNotificationsModal = async function() {
        const modal = document.getElementById('notificationsHistoryModal');
        const container = document.getElementById('notifHistoryContainer');
        if (!modal || !container) return;

        modal.style.display = 'flex';
        container.innerHTML = `<div style="text-align: center; padding: 60px 20px; color: var(--text-dim);"><i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem; margin-bottom: 15px;"></i><p>Carregando histórico...</p></div>`;

        try {
            const res = await fetch('/api/communications/history', {
                headers: { 'x-user': user }
            });
            const data = await res.json();

            if (!data.success || !data.history || data.history.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 60px 20px; color: var(--text-dim);"><i class="fa-solid fa-bell-slash" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5;"></i><p>Nenhuma notificação encontrada.</p></div>`;
                return;
            }

            container.innerHTML = data.history.map(msg => `
                <div class="notif-item ${msg.is_read ? '' : 'unread'}" id="notif-item-${msg.id}">
                    <div class="notif-date">
                        <i class="fa-solid fa-calendar-day"></i> 
                        ${new Date(msg.created_at).toLocaleString('pt-BR')} 
                        • De: ${msg.sender_name || 'Admin'}
                        ${msg.is_read ? '' : '<span class="notif-badge-new">Novo</span>'}
                    </div>
                    <div class="notif-message">${msg.message}</div>
                    ${msg.is_read ? '' : `
                        <button onclick="markNotificationRead(${msg.id}, this)" style="margin-top: 15px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); color: var(--color-primary); padding: 6px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: 0.3s;">
                            Entendido!
                        </button>
                    `}
                </div>
            `).join('');

        } catch (e) {
            console.error('Erro ao buscar histórico:', e);
            container.innerHTML = `<div style="color: var(--status-danger); text-align: center; padding: 40px;">Falha ao carregar histórico.</div>`;
        }
    };

    window.closeNotificationsModal = function() {
        document.getElementById('notificationsHistoryModal').style.display = 'none';
    };

    window.markNotificationRead = async function(id, btn) {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        }
        try {
            await fetch('/api/communications/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user': user },
                body: JSON.stringify({ message_id: id })
            });
            
            const item = document.getElementById(`notif-item-${id}`);
            if (item) {
                item.classList.remove('unread');
                const badge = item.querySelector('.notif-badge-new');
                if (badge) badge.remove();
                if (btn) btn.remove();
            }
            
            checkNotifications(); // Refresh badge count
        } catch (e) {
            console.error('Erro ao marcar como lida:', e);
        }
    };

    function showMessagePopup(msg) {
        let modal = document.getElementById('comm-popup-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'comm-popup-modal';
            modal.style = `
                position: fixed; inset: 0; background: rgba(0,0,0,0.8); 
                display: flex; align-items: center; justify-content: center; 
                z-index: 10005; backdrop-filter: blur(12px);
                animation: commFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
            `;
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="background: #09090b; border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 24px; width: 95%; max-width: 500px; overflow: hidden; box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.8), 0 0 20px rgba(251, 191, 36, 0.05); animation: commSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);">
                <!-- Header Premium -->
                <div style="background: linear-gradient(to right, rgba(251, 191, 36, 0.1), transparent); padding: 25px 30px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 20px;">
                    <div style="width: 56px; height: 56px; background: #fbbf24; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: #000; font-size: 1.6rem; box-shadow: 0 8px 16px rgba(251, 191, 36, 0.3);">
                        <i class="fa-solid fa-bell"></i>
                    </div>
                    <div>
                        <h3 style="margin: 0; color: #fff; font-size: 1.25rem; font-weight: 800; letter-spacing: -0.02em;">Novo Comunicado</h3>
                        <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #a1a1aa; font-weight: 500;">De: <span style="color: #fbbf24; font-weight: 700;">${msg.sender_name || 'Admin'}</span></p>
                    </div>
                </div>

                <!-- Conteúdo -->
                <div style="padding: 30px; background: radial-gradient(circle at top right, rgba(251, 191, 36, 0.03), transparent);">
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 25px; color: #e4e4e7; line-height: 1.7; font-size: 1rem; max-height: 300px; overflow-y: auto; white-space: pre-wrap; margin-bottom: 30px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
${msg.message}
                    </div>

                    <!-- Ações -->
                    <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 15px;">
                        <button id="read-later-comm" style="background: rgba(255,255,255,0.05); color: #a1a1aa; border: 1px solid rgba(255,255,255,0.1); padding: 14px; border-radius: 14px; font-weight: 700; cursor: pointer; transition: 0.3s; font-size: 0.9rem;">
                            Ler mais tarde
                        </button>
                        <button id="mark-read-comm" style="background: #fbbf24; color: #000; border: none; padding: 14px; border-radius: 14px; font-weight: 800; cursor: pointer; transition: 0.3s; font-size: 1rem; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.2);">
                            Entendido!
                        </button>
                    </div>
                </div>
            </div>
            <style>
                @keyframes commFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes commSlideUp { from { opacity: 0; transform: translateY(40px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
            </style>
        `;

        modal.style.display = 'flex';

        document.getElementById('read-later-comm').addEventListener('click', () => {
            modal.style.display = 'none';
            sessionStorage.setItem('last_comm_popup_id', String(msg.id));
        });

        document.getElementById('mark-read-comm').addEventListener('click', async () => {
            const btn = document.getElementById('mark-read-comm');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            await markNotificationRead(msg.id);
            modal.style.display = 'none';
        });
    }

    if (bell) {
        bell.addEventListener('click', () => {
            openNotificationsModal();
        });
    }

    checkNotifications();
    setInterval(checkNotifications, 3 * 60 * 1000); // 3 min
})();
