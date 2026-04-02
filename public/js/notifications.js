// public/js/notifications.js

(function() {
    const user = localStorage.getItem('erus_user');
    const role = (localStorage.getItem('erus_role') || '').toLowerCase();

    if (!user) return;

    // Elementos da UI
    const bell = document.getElementById('notification-bell');
    const countBadge = document.getElementById('notification-count');
    const commMenuItem = document.getElementById('comm-menu-item');
    const commNotifDot = document.getElementById('comm-notif-dot');

    // Mostrar menu de comunicação apenas para admin/dev
    if (commMenuItem && (role === 'admin' || role === 'desenvolvedor')) {
        commMenuItem.style.display = 'flex';
    }

    async function checkNotifications() {
        try {
            const res = await fetch('/api/communications/unread', {
                headers: { 'x-user': user }
            });
            const data = await res.json();

            if (data.success && data.unread.length > 0) {
                updateBell(data.unread.length);
                
                // Mostrar popup apenas se estiver na index.html (evitar spam em todas as subpáginas)
                const isIndexPath = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
                if (isIndexPath) {
                    showMessagePopup(data.unread[0]); // Mostra a primeira não lida
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
            if (commNotifDot) commNotifDot.style.display = 'block';
        } else {
            countBadge.style.display = 'none';
            if (commNotifDot) commNotifDot.style.display = 'none';
        }
    }

    function showMessagePopup(msg) {
        // Criar o modal dinamicamente se não existir
        let modal = document.getElementById('comm-popup-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'comm-popup-modal';
            modal.style = `
                position: fixed; inset: 0; background: rgba(0,0,0,0.85); 
                display: flex; align-items: center; justify-content: center; 
                z-index: 10000; backdrop-filter: blur(8px);
                animation: fadeIn 0.4s ease;
            `;
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="background: #18181b; border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 20px; width: 90%; max-width: 450px; padding: 30px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); animation: slideUp 0.4s ease;">
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                    <div style="width: 50px; height: 50px; background: rgba(251, 191, 36, 0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fbbf24; font-size: 1.5rem;">
                        <i class="fa-solid fa-bullhorn"></i>
                    </div>
                    <div>
                        <h3 style="margin: 0; color: #fff; font-family: 'Outfit', sans-serif;">Aviso do Sistema</h3>
                        <p style="margin: 0; font-size: 0.75rem; color: #a1a1aa;">Enviado por ${msg.sender_name || 'Administrador'}</p>
                    </div>
                </div>
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 20px; margin-bottom: 25px; color: #f4f4f5; line-height: 1.6; font-size: 0.95rem;">
                    ${msg.message}
                </div>
                <button id="close-comm-popup" style="width: 100%; background: #fbbf24; color: #000; border: none; padding: 14px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: 0.3s; font-size: 1rem;">
                    Entendido, obrigado!
                </button>
            </div>
            <style>
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            </style>
        `;

        modal.style.display = 'flex';

        document.getElementById('close-comm-popup').addEventListener('click', async () => {
            modal.style.display = 'none';
            // Marcar como lida
            await fetch('/api/communications/mark-read', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user': user
                },
                body: JSON.stringify({ message_id: msg.id })
            });
            // Re-checar se há mais mensagens
            checkNotifications();
        });
    }

    // Ao clicar no sino, ou abrir a tela de comunicações se for admin, ou mostrar as mensagens
    if (bell) {
        bell.addEventListener('click', () => {
            if (role === 'admin' || role === 'desenvolvedor') {
                window.location.href = 'comunicacao.html';
            } else {
                checkNotifications(); // Força re-checagem
            }
        });
    }

    // Verificar ao carregar
    checkNotifications();

    // Opcional: Polling a cada 5 minutos
    setInterval(checkNotifications, 5 * 60 * 1000);
})();
