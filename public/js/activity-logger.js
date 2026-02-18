
(function () {
    // Helper to get current user
    function getUserName() {
        return localStorage.getItem('erus_user') || localStorage.getItem('erus_username') || 'Visitante';
    }

    // Helper to log activity
    async function logActivity(action, details = {}) {
        const user = getUserName();
        const page = window.location.pathname.split('/').pop() || 'index.html';

        try {
            await fetch('/api/audit-logger/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_name: user,
                    action: action,
                    table_name: page,
                    details: details
                })
            });
        } catch (e) {
            console.error('Failed to log activity:', e);
        }
    }

    // --- SISTEMA DE BLOQUEIO DE PÁGINAS (ENFORCEMENT) ---
    async function checkPageLock() {
        const page = window.location.pathname.split('/').pop() || 'index.html';
        const role = (localStorage.getItem('erus_role') || 'Visitante').toLowerCase();

        // Desenvolvedores e Admins ignoram bloqueios
        if (role === 'desenvolvedor' || role === 'admin') return;

        try {
            const response = await fetch('/api/page-locks');
            const result = await response.json();

            if (result.success && Array.isArray(result.data)) {
                const lock = result.data.find(l => l.page_id === page);
                if (lock && lock.is_locked) {
                    showMaintenanceOverlay();
                }
            }
        } catch (e) {
            console.error('Erro ao verificar bloqueio de página:', e);
        }
    }

    function showMaintenanceOverlay() {
        // 1. Aplicar Blur no body (Exceto o overlay)
        const appLayout = document.querySelector('.app-layout') || document.body;
        appLayout.style.filter = 'blur(20px)';
        appLayout.style.pointerEvents = 'none';
        appLayout.style.userSelect = 'none';

        // 2. Criar Overlay
        const overlay = document.createElement('div');
        overlay.id = 'maintenance-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(9, 9, 11, 0.85);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            color: #fff;
            font-family: 'Inter', sans-serif;
            text-align: center;
            padding: 20px;
            backdrop-filter: blur(5px);
        `;

        overlay.innerHTML = `
            <div style="max-width: 600px; background: rgba(255, 255, 255, 0.03); padding: 40px; border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                <div style="width: 80px; height: 80px; background: rgba(251, 191, 36, 0.1); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                    <i class="fa-solid fa-screwdriver-wrench" style="font-size: 32px; color: #fbbf24;"></i>
                </div>
                <h1 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 16px; letter-spacing: -0.02em;">Acesso Temporariamente Suspenso</h1>
                <p style="color: #a1a1aa; line-height: 1.6; margin-bottom: 32px; font-size: 1.05rem;">
                    Esta página está passando por atualizações técnicas para aprimorar a precisão dos dados e a performance do sistema. 
                    <br><br>
                    O acesso será normalizado assim que as melhorias forem concluídas. Agradecemos a compreensão.
                </p>
                <a href="index.html" style="display: inline-flex; align-items: center; justify-content: center; background: #fff; color: #000; padding: 12px 32px; border-radius: 12px; font-weight: 700; text-decoration: none; transition: transform 0.2s ease; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
                    Voltar para o Início
                </a>
            </div>
        `;

        document.body.appendChild(overlay);

        // Impedir que o usuário use ESC para fechar algo se estiver bloqueado
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') e.preventDefault();
        }, true);
    }

    // 1. Log Page Visit on Load
    window.addEventListener('load', () => {
        checkPageLock(); // Verificar se a página está bloqueada
        logActivity('PAGE_VISIT', {
            title: document.title,
            url: window.location.href
        });
    });

    // 2. Log Modal Openings
    document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
            document.body.addEventListener('shown.bs.modal', function (event) {
                const modalId = event.target.id;
                const modalTitle = event.target.querySelector('.modal-title')?.innerText || 'Sem Título';

                logActivity('MODAL_OPEN', {
                    modal_id: modalId,
                    modal_title: modalTitle
                });
            }, true);
        }
    });

})();
