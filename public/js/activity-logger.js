
(function () {
    // Evitar execução duplicada se o script for incluído mais de uma vez
    if (window.__activityLoggerLoaded) return;
    window.__activityLoggerLoaded = true;
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

        // Desenvolvedores e Admins ignoram bloqueios manuais, mas NÃO sync locks
        try {
            const response = await fetch('/api/page-locks');
            const result = await response.json();

            if (result.success && Array.isArray(result.data)) {
                const lock = result.data.find(l => l.page_id === page);
                if (lock && lock.is_locked) {
                    if (lock.lock_reason === 'sync') {
                        // Sync lock afeta TODOS os usuários, inclusive devs
                        showSyncOverlay(lock);
                    } else if (role !== 'desenvolvedor' && role !== 'admin') {
                        // Bloqueio manual — apenas não-devs
                        showMaintenanceOverlay();
                    }
                }
            }
        } catch (e) {
            console.error('Erro ao verificar bloqueio de página:', e);
        }
    }

    function showMaintenanceOverlay() {
        // Evitar criar overlay duplicado
        if (document.getElementById('maintenance-overlay')) return;

        // 1. Injetar estilos de animação
        const style = document.createElement('style');
        style.textContent = `
            @keyframes mt-overlay-fadein {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes mt-modal-enter {
                0% { opacity: 0; transform: translateY(30px) scale(0.92); }
                60% { transform: translateY(-6px) scale(1.02); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes mt-icon-float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-8px); }
            }
            @keyframes mt-icon-rotate {
                0%, 100% { transform: translateY(0) rotate(0deg); }
                25% { transform: translateY(-8px) rotate(-8deg); }
                75% { transform: translateY(-4px) rotate(8deg); }
            }
            @keyframes mt-pulse-dot {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.5; transform: scale(1.4); }
            }
            @keyframes mt-shimmer {
                0% { background-position: -200% center; }
                100% { background-position: 200% center; }
            }
            @keyframes mt-border-glow {
                0%, 100% { border-color: rgba(251, 191, 36, 0.15); }
                50% { border-color: rgba(251, 191, 36, 0.35); }
            }
            @keyframes mt-gear-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            #maintenance-overlay {
                animation: mt-overlay-fadein 0.6s ease-out forwards;
            }
            #maintenance-overlay .mt-modal {
                animation: mt-modal-enter 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
            }
            #maintenance-overlay .mt-icon-wrap {
                animation: mt-icon-rotate 3s ease-in-out infinite;
            }
            #maintenance-overlay .mt-pulse {
                animation: mt-pulse-dot 2s ease-in-out infinite;
            }
            #maintenance-overlay .mt-modal {
                animation: mt-modal-enter 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both,
                           mt-border-glow 3s ease-in-out infinite 1s;
            }
            #maintenance-overlay .mt-title {
                background: linear-gradient(90deg, #fff 0%, #fbbf24 30%, #fff 60%, #fbbf24 100%);
                background-size: 200% auto;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                animation: mt-shimmer 4s linear infinite;
            }
            #maintenance-overlay .mt-btn {
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            #maintenance-overlay .mt-btn:hover {
                transform: translateY(-2px) scale(1.04);
                box-shadow: 0 14px 30px -6px rgba(251, 191, 36, 0.35);
                background: linear-gradient(135deg, #fbbf24, #f59e0b) !important;
            }
            #maintenance-overlay .mt-gear {
                animation: mt-gear-spin 6s linear infinite;
            }
        `;
        document.head.appendChild(style);

        // 2. Aplicar Blur no conteúdo da página (sem afetar o overlay)
        let blurTarget = document.querySelector('.app-layout');
        if (!blurTarget) {
            // Se não há .app-layout, encapsular todo o conteúdo do body num wrapper
            blurTarget = document.createElement('div');
            blurTarget.id = 'mt-blur-wrapper';
            while (document.body.firstChild) {
                blurTarget.appendChild(document.body.firstChild);
            }
            document.body.appendChild(blurTarget);
        }
        blurTarget.style.filter = 'blur(8px) saturate(0.5)';
        blurTarget.style.pointerEvents = 'none';
        blurTarget.style.userSelect = 'none';
        blurTarget.style.transition = 'filter 0.6s ease';

        // 3. Criar Overlay (semi-transparente para ver o conteúdo atrás com blur)
        const overlay = document.createElement('div');
        overlay.id = 'maintenance-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(9, 9, 11, 0.55);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            color: #fff;
            font-family: 'Inter', sans-serif;
            text-align: center;
            padding: 20px;
            backdrop-filter: blur(2px);
            opacity: 0;
        `;

        overlay.innerHTML = `
            <div class="mt-modal" style="
                max-width: 520px;
                width: 100%;
                background: rgba(15, 15, 20, 0.85);
                backdrop-filter: blur(40px) saturate(1.5);
                -webkit-backdrop-filter: blur(40px) saturate(1.5);
                padding: 48px 40px 40px;
                border-radius: 28px;
                border: 1px solid rgba(251, 191, 36, 0.15);
                box-shadow:
                    0 0 0 1px rgba(255,255,255,0.04),
                    0 30px 60px -12px rgba(0, 0, 0, 0.6),
                    0 0 80px -20px rgba(251, 191, 36, 0.12);
                position: relative;
                overflow: hidden;
            ">
                <!-- Decorative gear background -->
                <div style="position: absolute; top: -30px; right: -30px; opacity: 0.03; pointer-events: none;">
                    <i class="fa-solid fa-gear mt-gear" style="font-size: 120px; color: #fbbf24;"></i>
                </div>
                <div style="position: absolute; bottom: -20px; left: -20px; opacity: 0.02; pointer-events: none;">
                    <i class="fa-solid fa-gear mt-gear" style="font-size: 80px; color: #fbbf24; animation-direction: reverse;"></i>
                </div>

                <!-- Status indicator -->
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 28px;">
                    <span class="mt-pulse" style="width: 8px; height: 8px; background: #fbbf24; border-radius: 50%; display: inline-block;"></span>
                    <span style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #fbbf24;">Em Manutenção</span>
                </div>

                <!-- Icon -->
                <div class="mt-icon-wrap" style="
                    width: 88px;
                    height: 88px;
                    background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(251, 191, 36, 0.05));
                    border-radius: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 28px;
                    border: 1px solid rgba(251, 191, 36, 0.2);
                    box-shadow: 0 8px 24px -4px rgba(251, 191, 36, 0.15);
                ">
                    <i class="fa-solid fa-screwdriver-wrench" style="font-size: 36px; color: #fbbf24;"></i>
                </div>

                <!-- Title -->
                <h1 class="mt-title" style="
                    font-size: 1.6rem;
                    font-weight: 800;
                    margin-bottom: 14px;
                    letter-spacing: -0.03em;
                    line-height: 1.2;
                ">Acesso Temporariamente<br>Suspenso</h1>

                <!-- Description -->
                <p style="
                    color: #a1a1aa;
                    line-height: 1.7;
                    margin-bottom: 12px;
                    font-size: 0.95rem;
                    max-width: 400px;
                    margin-left: auto;
                    margin-right: auto;
                ">
                    Esta página está em <strong style="color: #e4e4e7;">manutenção</strong> para melhorias de desempenho e precisão dos dados.
                </p>
                <p style="
                    color: #71717a;
                    line-height: 1.6;
                    margin-bottom: 32px;
                    font-size: 0.85rem;
                ">
                    O acesso será restaurado em breve. Agradecemos a compreensão.
                </p>

                <!-- Divider -->
                <div style="
                    width: 60px;
                    height: 2px;
                    background: linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.4), transparent);
                    margin: 0 auto 28px;
                    border-radius: 1px;
                "></div>

                <!-- Button -->
                <a href="index.html" class="mt-btn" style="
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    background: linear-gradient(135deg, #fbbf24, #d97706);
                    color: #000;
                    padding: 14px 36px;
                    border-radius: 14px;
                    font-weight: 700;
                    font-size: 0.9rem;
                    text-decoration: none;
                    box-shadow: 0 10px 25px -5px rgba(251, 191, 36, 0.3);
                    letter-spacing: 0.01em;
                ">
                    <i class="fa-solid fa-arrow-left" style="font-size: 14px;"></i>
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

    // --- OVERLAY DE SINCRONIZAÇÃO (DADOS ATUALIZANDO) ---
    function showSyncOverlay(lockData) {
        // Evitar overlay duplicado
        if (document.getElementById('sync-overlay')) return;

        // Calcular progresso real baseado no servidor
        const syncStartedAt = lockData && lockData.sync_started_at ? new Date(lockData.sync_started_at).getTime() : Date.now();
        const syncEstimatedMs = lockData && lockData.sync_estimated_ms ? lockData.sync_estimated_ms : 120000;
        const estimatedMinutes = Math.ceil(syncEstimatedMs / 60000);
        const estimatedLabel = estimatedMinutes <= 1 ? '~1 minuto' : `~${estimatedMinutes} minutos`;

        // 1. Injetar estilos
        const style = document.createElement('style');
        style.textContent = `
            @keyframes sync-fadein {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes sync-modal-enter {
                0% { opacity: 0; transform: translateY(30px) scale(0.92); }
                60% { transform: translateY(-6px) scale(1.02); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes sync-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            @keyframes sync-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.5; transform: scale(1.3); }
            }
            @keyframes sync-shimmer {
                0% { background-position: -200% center; }
                100% { background-position: 200% center; }
            }
            @keyframes sync-border-glow {
                0%, 100% { border-color: rgba(59, 130, 246, 0.15); }
                50% { border-color: rgba(59, 130, 246, 0.4); }
            }
            #sync-overlay {
                animation: sync-fadein 0.5s ease-out forwards;
            }
            #sync-overlay .sync-modal {
                animation: sync-modal-enter 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both,
                           sync-border-glow 3s ease-in-out infinite 1s;
            }
            #sync-overlay .sync-spinner {
                animation: sync-spin 1.5s linear infinite;
            }
            #sync-overlay .sync-pulse {
                animation: sync-pulse 2s ease-in-out infinite;
            }
            #sync-overlay .sync-title {
                background: linear-gradient(90deg, #fff 0%, #60a5fa 30%, #fff 60%, #60a5fa 100%);
                background-size: 200% auto;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                animation: sync-shimmer 4s linear infinite;
            }
            #sync-overlay .sync-btn {
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            #sync-overlay .sync-btn:hover {
                transform: translateY(-2px) scale(1.04);
                box-shadow: 0 14px 30px -6px rgba(59, 130, 246, 0.35);
                background: linear-gradient(135deg, #60a5fa, #3b82f6) !important;
            }
        `;
        document.head.appendChild(style);

        // 2. Blur
        let blurTarget = document.querySelector('.app-layout');
        if (!blurTarget) {
            blurTarget = document.createElement('div');
            blurTarget.id = 'sync-blur-wrapper';
            while (document.body.firstChild) {
                blurTarget.appendChild(document.body.firstChild);
            }
            document.body.appendChild(blurTarget);
        }
        blurTarget.style.filter = 'blur(8px) saturate(0.5)';
        blurTarget.style.pointerEvents = 'none';
        blurTarget.style.userSelect = 'none';
        blurTarget.style.transition = 'filter 0.6s ease';

        // Calcular progresso inicial
        const elapsedMs = Date.now() - syncStartedAt;
        const initialProgress = Math.min((elapsedMs / syncEstimatedMs) * 100, 95);

        // 3. Overlay
        const overlay = document.createElement('div');
        overlay.id = 'sync-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(9, 9, 11, 0.6);
            display: flex; align-items: center; justify-content: center;
            z-index: 99999;
            color: #fff;
            font-family: 'Inter', sans-serif;
            text-align: center;
            padding: 20px;
            backdrop-filter: blur(2px);
            opacity: 0;
        `;

        overlay.innerHTML = `
            <div class="sync-modal" style="
                max-width: 520px; width: 100%;
                background: rgba(15, 15, 20, 0.88);
                backdrop-filter: blur(40px) saturate(1.5);
                -webkit-backdrop-filter: blur(40px) saturate(1.5);
                padding: 48px 40px 40px;
                border-radius: 28px;
                border: 1px solid rgba(59, 130, 246, 0.15);
                box-shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 30px 60px -12px rgba(0,0,0,0.6), 0 0 80px -20px rgba(59, 130, 246, 0.12);
                position: relative; overflow: hidden;
            ">
                <!-- Status -->
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 28px;">
                    <span class="sync-pulse" style="width: 8px; height: 8px; background: #60a5fa; border-radius: 50%; display: inline-block;"></span>
                    <span style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #60a5fa;">Sincronização em Andamento</span>
                </div>

                <!-- Icon -->
                <div style="
                    width: 88px; height: 88px;
                    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05));
                    border-radius: 24px;
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 28px;
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    box-shadow: 0 8px 24px -4px rgba(59, 130, 246, 0.15);
                ">
                    <i class="fa-solid fa-arrows-rotate sync-spinner" style="font-size: 36px; color: #60a5fa;"></i>
                </div>

                <!-- Title -->
                <h1 class="sync-title" style="font-size: 1.5rem; font-weight: 800; margin-bottom: 14px; letter-spacing: -0.03em; line-height: 1.2;">
                    Dados Sendo Atualizados
                </h1>

                <!-- Description -->
                <p style="color: #a1a1aa; line-height: 1.7; margin-bottom: 8px; font-size: 0.95rem; max-width: 400px; margin-left: auto; margin-right: auto;">
                    Os dados desta tela estão sendo <strong style="color: #e4e4e7;">sincronizados</strong> com o sistema ERP.
                </p>
                <p style="color: #71717a; line-height: 1.6; margin-bottom: 20px; font-size: 0.85rem;">
                    Tempo estimado: <strong style="color: #60a5fa;">${estimatedLabel}</strong>
                </p>

                <!-- Progress bar -->
                <div style="
                    width: 100%; max-width: 360px; height: 6px;
                    background: rgba(59, 130, 246, 0.1);
                    border-radius: 3px; margin: 0 auto 6px;
                    overflow: hidden;
                ">
                    <div id="sync-progress-fill" style="
                        height: 100%; 
                        background: linear-gradient(90deg, #3b82f6, #60a5fa); 
                        border-radius: 3px; 
                        width: ${initialProgress}%;
                        transition: width 1s linear;
                    "></div>
                </div>
                <p id="sync-progress-label" style="color: #52525b; font-size: 0.75rem; margin-bottom: 20px;">
                    ${Math.round(initialProgress)}%
                </p>

                <!-- Divider -->
                <div style="width: 60px; height: 2px; background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.4), transparent); margin: 0 auto 28px; border-radius: 1px;"></div>

                <!-- Button -->
                <a href="index.html" class="sync-btn" style="
                    display: inline-flex; align-items: center; justify-content: center; gap: 10px;
                    background: linear-gradient(135deg, #3b82f6, #2563eb);
                    color: #fff; padding: 14px 36px; border-radius: 14px;
                    font-weight: 700; font-size: 0.9rem; text-decoration: none;
                    box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.3);
                    letter-spacing: 0.01em;
                ">
                    <i class="fa-solid fa-arrow-left" style="font-size: 14px;"></i>
                    Voltar para o Início
                </a>
            </div>
        `;

        document.body.appendChild(overlay);

        // Atualizar barra de progresso a cada segundo (progresso real baseado no tempo do servidor)
        const progressFill = document.getElementById('sync-progress-fill');
        const progressLabel = document.getElementById('sync-progress-label');
        const progressInterval = setInterval(() => {
            const elapsed = Date.now() - syncStartedAt;
            const pct = Math.min((elapsed / syncEstimatedMs) * 100, 95); // Nunca chega a 100 até desbloquear
            if (progressFill) progressFill.style.width = pct + '%';
            if (progressLabel) progressLabel.textContent = Math.round(pct) + '%';
        }, 1000);

        // Bloquear ESC
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') e.preventDefault();
        }, true);
    }

    // --- SISTEMA DE CONTROLE DE SESSÃO (CENTRALIZADO) ---
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos

    function verificarSessao() {
        // Ignorar na página de login
        if (window.location.pathname.includes('login.html')) return;

        const logado = localStorage.getItem('erus_auth');
        const ultimaAtividade = localStorage.getItem('erus_last_activity');
        const agora = Date.now();

        // Se não estiver logado
        if (logado !== 'true' || !ultimaAtividade) {
            redirecionarLogin();
            return;
        }

        // Se o tempo de inatividade passou do limite
        if (agora - parseInt(ultimaAtividade) > SESSION_TIMEOUT) {
            showSessionExpiredOverlay();
        }
    }

    function atualizarAtividade() {
        if (localStorage.getItem('erus_auth') === 'true') {
            localStorage.setItem('erus_last_activity', Date.now().toString());
        }
    }

    function redirecionarLogin() {
        localStorage.clear();
        window.location.replace('login.html');
    }

    function showSessionExpiredOverlay() {
        // Evitar duplicado
        if (document.getElementById('session-expired-overlay')) return;

        // Limpar localStorage
        localStorage.removeItem('erus_auth');
        localStorage.removeItem('erus_last_activity');

        // Injetar estilos de animação
        const style = document.createElement('style');
        style.textContent = `
            @keyframes se-overlay-fadein {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes se-modal-enter {
                0% { opacity: 0; transform: translateY(30px) scale(0.92); }
                60% { transform: translateY(-6px) scale(1.02); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes se-pulse-ring {
                0% { transform: scale(0.8); opacity: 1; }
                100% { transform: scale(2.2); opacity: 0; }
            }
            @keyframes se-shake {
                0%, 100% { transform: translateX(0); }
                20% { transform: translateX(-4px); }
                40% { transform: translateX(4px); }
                60% { transform: translateX(-3px); }
                80% { transform: translateX(3px); }
            }
            @keyframes se-countdown-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
            }
            #session-expired-overlay {
                animation: se-overlay-fadein 0.5s ease-out forwards;
            }
            #session-expired-overlay .se-modal {
                animation: se-modal-enter 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both;
            }
            #session-expired-overlay .se-icon-wrap {
                animation: se-shake 0.6s ease-in-out 0.8s;
            }
            #session-expired-overlay .se-pulse-ring {
                animation: se-pulse-ring 1.5s ease-out infinite;
            }
            #session-expired-overlay .se-timer {
                animation: se-countdown-pulse 2s ease-in-out infinite;
            }
            #session-expired-overlay .se-btn {
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            #session-expired-overlay .se-btn:hover {
                transform: translateY(-2px) scale(1.04);
                box-shadow: 0 14px 30px -6px rgba(239, 68, 68, 0.35);
                background: linear-gradient(135deg, #ef4444, #dc2626) !important;
            }
        `;
        document.head.appendChild(style);

        // Aplicar blur no conteúdo
        let blurTarget = document.querySelector('.app-layout');
        if (!blurTarget) {
            blurTarget = document.createElement('div');
            blurTarget.id = 'se-blur-wrapper';
            while (document.body.firstChild) {
                blurTarget.appendChild(document.body.firstChild);
            }
            document.body.appendChild(blurTarget);
        }
        blurTarget.style.filter = 'blur(8px) saturate(0.5)';
        blurTarget.style.pointerEvents = 'none';
        blurTarget.style.userSelect = 'none';
        blurTarget.style.transition = 'filter 0.6s ease';

        // Criar overlay
        const overlay = document.createElement('div');
        overlay.id = 'session-expired-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(9, 9, 11, 0.6);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            color: #fff;
            font-family: 'Inter', sans-serif;
            text-align: center;
            padding: 20px;
            backdrop-filter: blur(2px);
            opacity: 0;
        `;

        overlay.innerHTML = `
            <div class="se-modal" style="
                max-width: 480px;
                width: 100%;
                background: rgba(15, 15, 20, 0.88);
                backdrop-filter: blur(40px) saturate(1.5);
                -webkit-backdrop-filter: blur(40px) saturate(1.5);
                padding: 44px 36px 36px;
                border-radius: 28px;
                border: 1px solid rgba(239, 68, 68, 0.15);
                box-shadow:
                    0 0 0 1px rgba(255,255,255,0.04),
                    0 30px 60px -12px rgba(0, 0, 0, 0.6),
                    0 0 60px -20px rgba(239, 68, 68, 0.1);
                position: relative;
                overflow: hidden;
            ">
                <!-- Status indicator -->
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 24px;">
                    <div style="position: relative; width: 8px; height: 8px;">
                        <span style="position: absolute; width: 8px; height: 8px; background: #ef4444; border-radius: 50; display: inline-block;"></span>
                        <span class="se-pulse-ring" style="position: absolute; width: 8px; height: 8px; border: 2px solid #ef4444; border-radius: 50%; display: inline-block;"></span>
                    </div>
                    <span style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #ef4444;">Sessão Expirada</span>
                </div>

                <!-- Icon -->
                <div class="se-icon-wrap" style="
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
                    border-radius: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 24px;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    box-shadow: 0 8px 24px -4px rgba(239, 68, 68, 0.12);
                ">
                    <i class="fa-solid fa-clock-rotate-left" style="font-size: 32px; color: #ef4444;"></i>
                </div>

                <!-- Title -->
                <h1 style="
                    font-size: 1.5rem;
                    font-weight: 800;
                    margin-bottom: 12px;
                    letter-spacing: -0.03em;
                    line-height: 1.2;
                    color: #fff;
                ">Sessão Expirada</h1>

                <!-- Description -->
                <p style="
                    color: #a1a1aa;
                    line-height: 1.7;
                    margin-bottom: 10px;
                    font-size: 0.92rem;
                    max-width: 380px;
                    margin-left: auto;
                    margin-right: auto;
                ">
                    Sua sessão foi encerrada por <strong style="color: #e4e4e7;">inatividade de 30 minutos</strong>.
                </p>
                <p style="
                    color: #71717a;
                    line-height: 1.6;
                    margin-bottom: 28px;
                    font-size: 0.82rem;
                ">
                    Por questões de segurança, faça login novamente para continuar.
                </p>

                <!-- Divider -->
                <div style="
                    width: 60px;
                    height: 2px;
                    background: linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.4), transparent);
                    margin: 0 auto 24px;
                    border-radius: 1px;
                "></div>

                <!-- Button -->
                <a href="login.html" class="se-btn" style="
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    background: linear-gradient(135deg, #ef4444, #b91c1c);
                    color: #fff;
                    padding: 14px 36px;
                    border-radius: 14px;
                    font-weight: 700;
                    font-size: 0.9rem;
                    text-decoration: none;
                    box-shadow: 0 10px 25px -5px rgba(239, 68, 68, 0.3);
                    letter-spacing: 0.01em;
                ">
                    <i class="fa-solid fa-right-to-bracket" style="font-size: 14px;"></i>
                    Voltar para Login
                </a>
            </div>
        `;

        document.body.appendChild(overlay);

        // Bloquear interações
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') e.preventDefault();
        }, true);
    }

    // --- INICIALIZAÇÃO ---

    // Verificar sessão IMEDIATAMENTE (antes de qualquer renderização)
    if (!window.location.pathname.includes('login.html')) {
        verificarSessao();
    }

    // 1. Log Page Visit on Load + verificar bloqueio
    window.addEventListener('load', () => {
        checkPageLock(); // Verificar se a página está bloqueada
        logActivity('PAGE_VISIT', {
            title: document.title,
            url: window.location.href
        });
    });

    // 1b. Polling de sync lock a cada 10s (detecta bloqueio enquanto usuário está na página)
    setInterval(() => {
        if (!document.getElementById('sync-overlay') && !document.getElementById('maintenance-overlay')) {
            checkPageLock();
        }
    }, 10000);

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

    // 3. Monitorar interações para resetar cronômetro de inatividade
    const eventos = ['mousedown', 'mousemove', 'keypress', 'touchstart', 'scroll'];
    eventos.forEach(evento => {
        window.addEventListener(evento, atualizarAtividade, { passive: true });
    });

    // 4. Verificar sessão periodicamente (a cada 60s)
    setInterval(verificarSessao, 60000);

})();
