
(function () {
    // Evitar execução duplicada se o script for incluído mais de uma vez
    if (window.__activityLoggerLoaded) return;
    window.__activityLoggerLoaded = true;
    const SYNC_TOAST_SHOW_DELAY_MS = 2000;
    const SYNC_TOAST_EXPOSURE_MS = 5000;
    const SYNC_TOAST_FADE_MS = 350;
    const SYNC_FLOAT_VISIBLE_HEIGHT = 110;
    let dismissedFloatingSyncKey = null;
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
                        // Todos os usuários: apenas indicador flutuante, sem bloquear tela
                        showFloatingSyncIndicator(lock);
                    } else if (role !== 'desenvolvedor' && role !== 'admin') {
                        // Bloqueio manual — apenas não-devs
                        if (lock.lock_reason === 'development') {
                            showDevelopmentOverlay();
                        } else {
                            showMaintenanceOverlay();
                        }
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

    function showDevelopmentOverlay() {
        if (document.getElementById('development-overlay')) return;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes dev-overlay-fadein {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes dev-modal-enter {
                0% { opacity: 0; transform: translateY(30px) scale(0.92); }
                60% { transform: translateY(-6px) scale(1.02); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes dev-icon-float {
                0%, 100% { transform: translateY(0) rotate(-4deg); }
                50% { transform: translateY(-8px) rotate(4deg); }
            }
            @keyframes dev-pulse-dot {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.5; transform: scale(1.4); }
            }
            @keyframes dev-shimmer {
                0% { background-position: -200% center; }
                100% { background-position: 200% center; }
            }
            @keyframes dev-border-glow {
                0%, 100% { border-color: rgba(168, 85, 247, 0.15); }
                50% { border-color: rgba(168, 85, 247, 0.35); }
            }
            @keyframes dev-code-blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0; }
            }
            #development-overlay {
                animation: dev-overlay-fadein 0.6s ease-out forwards;
            }
            #development-overlay .dev-modal {
                animation: dev-modal-enter 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both,
                           dev-border-glow 3s ease-in-out infinite 1s;
            }
            #development-overlay .dev-icon-wrap {
                animation: dev-icon-float 3s ease-in-out infinite;
            }
            #development-overlay .dev-pulse {
                animation: dev-pulse-dot 2s ease-in-out infinite;
            }
            #development-overlay .dev-title {
                background: linear-gradient(90deg, #fff 0%, #a855f7 30%, #fff 60%, #a855f7 100%);
                background-size: 200% auto;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                animation: dev-shimmer 4s linear infinite;
            }
            #development-overlay .dev-btn {
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            #development-overlay .dev-btn:hover {
                transform: translateY(-2px) scale(1.04);
                box-shadow: 0 14px 30px -6px rgba(168, 85, 247, 0.35);
                background: linear-gradient(135deg, #a855f7, #7e22ce) !important;
            }
            #development-overlay .dev-cursor {
                animation: dev-code-blink 1s step-end infinite;
            }
        `;
        document.head.appendChild(style);

        let blurTarget = document.querySelector('.app-layout');
        if (!blurTarget) {
            blurTarget = document.createElement('div');
            blurTarget.id = 'dev-blur-wrapper';
            while (document.body.firstChild) {
                blurTarget.appendChild(document.body.firstChild);
            }
            document.body.appendChild(blurTarget);
        }
        blurTarget.style.filter = 'blur(8px) saturate(0.5)';
        blurTarget.style.pointerEvents = 'none';
        blurTarget.style.userSelect = 'none';
        blurTarget.style.transition = 'filter 0.6s ease';

        const overlay = document.createElement('div');
        overlay.id = 'development-overlay';
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
            <div class="dev-modal" style="
                max-width: 520px;
                width: 100%;
                background: rgba(15, 15, 20, 0.85);
                backdrop-filter: blur(40px) saturate(1.5);
                -webkit-backdrop-filter: blur(40px) saturate(1.5);
                padding: 48px 40px 40px;
                border-radius: 28px;
                border: 1px solid rgba(168, 85, 247, 0.15);
                box-shadow:
                    0 0 0 1px rgba(255,255,255,0.04),
                    0 30px 60px -12px rgba(0, 0, 0, 0.6),
                    0 0 80px -20px rgba(168, 85, 247, 0.12);
                position: relative;
                overflow: hidden;
            ">
                <!-- Decorative code icon background -->
                <div style="position: absolute; top: -30px; right: -30px; opacity: 0.03; pointer-events: none;">
                    <i class="fa-solid fa-code" style="font-size: 120px; color: #a855f7;"></i>
                </div>
                <div style="position: absolute; bottom: -20px; left: -20px; opacity: 0.02; pointer-events: none;">
                    <i class="fa-solid fa-terminal" style="font-size: 80px; color: #a855f7;"></i>
                </div>

                <!-- Status indicator -->
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 28px;">
                    <span class="dev-pulse" style="width: 8px; height: 8px; background: #a855f7; border-radius: 50%; display: inline-block;"></span>
                    <span style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #a855f7;">Em Desenvolvimento</span>
                </div>

                <!-- Icon -->
                <div class="dev-icon-wrap" style="
                    width: 88px;
                    height: 88px;
                    background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(168, 85, 247, 0.05));
                    border-radius: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 28px;
                    border: 1px solid rgba(168, 85, 247, 0.2);
                    box-shadow: 0 8px 24px -4px rgba(168, 85, 247, 0.15);
                ">
                    <i class="fa-solid fa-code" style="font-size: 36px; color: #a855f7;"></i>
                </div>

                <!-- Title -->
                <h1 class="dev-title" style="
                    font-size: 1.6rem;
                    font-weight: 800;
                    margin-bottom: 14px;
                    letter-spacing: -0.03em;
                    line-height: 1.2;
                ">Página em<br>Desenvolvimento</h1>

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
                    Esta página está sendo <strong style="color: #e4e4e7;">desenvolvida</strong> pela equipe técnica e ainda não está disponível.
                </p>
                <p style="
                    color: #71717a;
                    line-height: 1.6;
                    margin-bottom: 32px;
                    font-size: 0.85rem;
                ">
                    Em breve esta funcionalidade estará disponível. Agradecemos a paciência.
                </p>

                <!-- Divider -->
                <div style="
                    width: 60px;
                    height: 2px;
                    background: linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.4), transparent);
                    margin: 0 auto 28px;
                    border-radius: 1px;
                "></div>

                <!-- Button -->
                <a href="index.html" class="dev-btn" style="
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    background: linear-gradient(135deg, #a855f7, #7e22ce);
                    color: #fff;
                    padding: 14px 36px;
                    border-radius: 14px;
                    font-weight: 700;
                    font-size: 0.9rem;
                    text-decoration: none;
                    box-shadow: 0 10px 25px -5px rgba(168, 85, 247, 0.3);
                    letter-spacing: 0.01em;
                ">
                    <i class="fa-solid fa-arrow-left" style="font-size: 14px;"></i>
                    Voltar para o Início
                </a>
            </div>
        `;

        document.body.appendChild(overlay);

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
            const pct = Math.min((elapsed / syncEstimatedMs) * 100, 100);
            if (progressFill) progressFill.style.width = pct + '%';
            if (progressLabel) progressLabel.textContent = Math.round(pct) + '%';
        }, 1000);

        // Verificar a cada 5s se o sync terminou — quando desbloquear, recarrega a página
        const page = window.location.pathname.split('/').pop() || 'index.html';
        const syncCheckInterval = setInterval(async () => {
            try {
                const resp = await fetch('/api/page-locks');
                const result = await resp.json();
                if (result.success && Array.isArray(result.data)) {
                    const lock = result.data.find(l => l.page_id === page);
                    if (!lock || !lock.is_locked || lock.lock_reason !== 'sync') {
                        // Sync terminou! Mostrar 100% e recarregar
                        clearInterval(progressInterval);
                        clearInterval(syncCheckInterval);
                        if (progressFill) progressFill.style.width = '100%';
                        if (progressLabel) progressLabel.textContent = '100%';
                        setTimeout(() => window.location.reload(), 1500);
                    }
                }
            } catch (e) { /* silenciar erros de rede */ }
        }, 5000);

        // Bloquear ESC
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') e.preventDefault();
        }, true);
    }

    // --- INDICADOR FLUTUANTE DE SINCRONIZAÇÃO (PARA DEVS) ---
    function showFloatingSyncIndicator(lockData) {
        // Evitar duplicado
        if (document.getElementById('sync-floating-indicator')) return;

        const page = window.location.pathname.split('/').pop() || 'index.html';
        const syncKey = `${page}:${lockData && lockData.sync_started_at ? lockData.sync_started_at : 'sync'}`;
        if (dismissedFloatingSyncKey === syncKey) return;

        const syncStartedAt = lockData && lockData.sync_started_at ? new Date(lockData.sync_started_at).getTime() : Date.now();
        const syncEstimatedMs = lockData && lockData.sync_estimated_ms ? lockData.sync_estimated_ms : 120000;

        // 1. Injetar estilos
        const style = document.createElement('style');
        style.textContent = `
            @keyframes sync-float-pulse {
                0%, 100% { box-shadow: 0 8px 32px rgba(59, 130, 246, 0.2); }
                50% { box-shadow: 0 8px 48px rgba(59, 130, 246, 0.4); }
            }
            #sync-floating-indicator.sync-float-visible {
                animation: sync-float-pulse 3s ease-in-out infinite;
            }
            .sync-float-progress {
                transition: width 1s linear;
            }
            .sync-float-toast-progress {
                transition: width ${SYNC_TOAST_EXPOSURE_MS}ms linear;
            }
            @media print {
                #sync-floating-indicator,
                #sync-overlay,
                #last-sync-toast {
                    display: none !important;
                    visibility: hidden !important;
                }
            }
        `;
        document.head.appendChild(style);

        // 2. Criar Elemento
        const indicator = document.createElement('div');
        indicator.id = 'sync-floating-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 280px;
            background: rgba(15, 15, 20, 0.85);
            backdrop-filter: blur(20px) saturate(1.8);
            -webkit-backdrop-filter: blur(20px) saturate(1.8);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 16px;
            padding: 16px;
            z-index: 100000;
            color: #fff;
            font-family: 'Inter', sans-serif;
            display: flex;
            flex-direction: column;
            gap: 12px;
            user-select: none;
            max-height: 0;
            overflow: hidden;
            opacity: 0;
            transition: max-height 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease, bottom 0.3s ease;
        `;

        const elapsedMs = Date.now() - syncStartedAt;
        const initialProgress = Math.min((elapsedMs / syncEstimatedMs) * 100, 95);

        indicator.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-arrows-rotate sync-spinner" style="color: #60a5fa; font-size: 14px;"></i>
                    <span style="font-size: 0.8rem; font-weight: 700; color: #60a5fa; letter-spacing: 0.02em;">SINC-DATA DEV</span>
                </div>
                <span id="sync-float-pct" style="font-size: 0.75rem; font-weight: 600; color: #a1a1aa;">${Math.round(initialProgress)}%</span>
            </div>
            
            <div style="width: 100%; height: 4px; background: rgba(59, 130, 246, 0.1); border-radius: 2px; overflow: hidden;">
                <div id="sync-float-fill" class="sync-float-progress" style="width: ${initialProgress}%; height: 100%; background: #3b82f6; border-radius: 2px;"></div>
            </div>

            <div id="sync-float-status" style="font-size: 0.7rem; color: #71717a; display: flex; align-items: center; gap: 4px;">
                <i class="fa-solid fa-cloud-arrow-down" style="font-size: 10px;"></i>
                <span>Sincronizando com SIGE...</span>
            </div>

            <div style="height:3px;background:rgba(147,197,253,0.12);border-radius:999px;overflow:hidden;">
                <div id="sync-float-toast-fill" class="sync-float-toast-progress" style="height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#93c5fd);border-radius:999px;"></div>
            </div>
        `;

        document.body.appendChild(indicator);

        // 3. Loops de Atualização
        const fill = document.getElementById('sync-float-fill');
        const toastFill = document.getElementById('sync-float-toast-fill');
        const pctText = document.getElementById('sync-float-pct');
        const statusText = document.getElementById('sync-float-status');

        let checkInterval;
        let safetyTimeout;
        let showTimer;
        let autoHideTimer;

        const updateInterval = setInterval(() => {
            const elapsed = Date.now() - syncStartedAt;
            const timePct = Math.min((elapsed / syncEstimatedMs) * 100, 95);
            if (fill) {
                fill.style.width = timePct + '%';
                if (pctText) pctText.textContent = Math.round(timePct) + '%';
            }
        }, 1000);

        function hideIndicator(markDismissed) {
            clearInterval(updateInterval);
            clearInterval(checkInterval);
            clearTimeout(safetyTimeout);
            clearTimeout(showTimer);
            clearTimeout(autoHideTimer);
            if (markDismissed) dismissedFloatingSyncKey = syncKey;
            if (indicator.parentNode) {
                indicator.classList.remove('sync-float-visible');
                indicator.style.animation = 'none';
                indicator.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
                indicator.style.maxHeight = '0';
                indicator.style.opacity = '0';
                setTimeout(() => { if (indicator.parentNode) indicator.remove(); }, SYNC_TOAST_FADE_MS);
            }
        }

        function finalizeSyncIndicator() {
            clearInterval(updateInterval);
            clearInterval(checkInterval);
            clearTimeout(safetyTimeout);
            clearTimeout(showTimer);
            clearTimeout(autoHideTimer);
            if (fill) { fill.style.width = '100%'; fill.style.background = '#10b981'; }
            if (pctText) { pctText.textContent = '100%'; pctText.style.color = '#10b981'; }
            if (statusText) statusText.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> <span style="color: #10b981;">Sincronização Finalizada</span>';
            autoHideTimer = setTimeout(() => hideIndicator(false), SYNC_TOAST_EXPOSURE_MS);
        }

        showTimer = setTimeout(() => {
            requestAnimationFrame(() => {
                indicator.classList.add('sync-float-visible');
                indicator.style.maxHeight = SYNC_FLOAT_VISIBLE_HEIGHT + 'px';
                indicator.style.opacity = '1';
                if (toastFill) requestAnimationFrame(() => { toastFill.style.width = '100%'; });
                autoHideTimer = setTimeout(() => hideIndicator(true), SYNC_TOAST_EXPOSURE_MS);
            });
        }, SYNC_TOAST_SHOW_DELAY_MS);

        checkInterval = setInterval(async () => {
            try {
                const resp = await fetch('/api/page-locks');
                const result = await resp.json();
                if (result.success && Array.isArray(result.data)) {
                    const lock = result.data.find(l => l.page_id === page);
                    if (!lock || !lock.is_locked || lock.lock_reason !== 'sync') {
                        finalizeSyncIndicator();
                    }
                }
            } catch (e) {}
        }, 2000);

        // Timeout de segurança: se o unlock nunca chegar, força limpeza após 3× o tempo estimado
        safetyTimeout = setTimeout(() => finalizeSyncIndicator(), Math.max(syncEstimatedMs * 3, 180000));
    }

    // --- ROLE ENFORCEMENT ---
    function enforceRoleAccess() {
        if (window.location.pathname.includes('login.html')) return;

        const page = window.location.pathname.split('/').pop() || 'index.html';
        const role = (localStorage.getItem('erus_role') || 'Visitante').toLowerCase();

        const rolePermissions = {
            'moldagem': ['fichatecmoldagem.html', 'apontamentos_produtivos.html'],
            'fusão': ['fichatecfusao.html'],
            'fusao': ['fichatecfusao.html'],
            'acabamento': ['fichatecacabamento.html'],
            'acabamento_externo': ['fichatecacabamento.html']
        };

        if (rolePermissions[role]) {
            const allowedPages = rolePermissions[role];
            const alwaysAllowed = ['index.html', 'solicitarchamados.html'];
            if (!alwaysAllowed.includes(page) && !allowedPages.includes(page)) {
                window.location.replace(allowedPages[0]);
                return true;
            }
        }
        return false;
    }

    // --- GLOBAL LOGOUT ---
    window.erusLogout = function () {
        localStorage.removeItem('erus_auth');
        localStorage.removeItem('erus_last_activity');
        localStorage.removeItem('erus_user');
        localStorage.removeItem('erus_role');
        window.location.replace('login.html');
    };

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

        // Se o tempo de inatividade passou do limite — redireciona direto sem overlay
        if (agora - parseInt(ultimaAtividade) > SESSION_TIMEOUT) {
            redirecionarLogin();
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
        enforceRoleAccess();
    }

    // --- TOAST ÚLTIMA SINCRONIZAÇÃO ---
    async function showLastSyncToast() {
        const page = window.location.pathname.split('/').pop() || 'index.html';
        try {
            const resp = await fetch('/api/page-locks/last-sync');
            const result = await resp.json();
            if (!result.success) return;
            const entry = (result.data || []).find(d => d.page_id === page);
            if (!entry || !entry.finished_at) return;
            if (document.getElementById('last-sync-toast')) return;

            const date = new Date(entry.finished_at);
            const dateFmt = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeFmt = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const toast = document.createElement('div');
            toast.id = 'last-sync-toast';
            toast.style.cssText = `
                position: fixed; right: 24px; width: 280px; z-index: 99998;
                background: rgba(5,46,22,0.95); backdrop-filter: blur(12px);
                border: 1px solid rgba(74,222,128,0.35); border-radius: 10px;
                padding: 0 16px; display: flex; align-items: flex-start; gap: 10px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 12px rgba(74,222,128,0.1);
                max-height: 0; overflow: hidden; opacity: 0;
                transition: max-height 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease, bottom 0.3s ease;
                pointer-events: none;
            `;
            toast.innerHTML = `
                <i class="fa-solid fa-rotate" style="color:#4ade80;font-size:0.8rem;flex-shrink:0;margin-top:14px;"></i>
                <div style="padding: 10px 0; flex:1; min-width:0;">
                    <div style="font-size:0.68rem;font-weight:600;color:#86efac;letter-spacing:0.05em;text-transform:uppercase;">Última sincronização</div>
                    <div style="font-size:0.82rem;font-weight:700;color:#dcfce7;">${dateFmt} às ${timeFmt}</div>
                    <div style="height:3px;background:rgba(187,247,208,0.16);border-radius:999px;overflow:hidden;margin-top:7px;">
                        <div class="last-sync-toast-progress" style="height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#86efac);border-radius:999px;transition:width ${SYNC_TOAST_EXPOSURE_MS}ms linear;"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(toast);
            setTimeout(() => {
                const syncIndicator = document.getElementById('sync-floating-indicator');
                const bottomBase = 20;
                const bottomPos = syncIndicator
                    ? bottomBase + Math.max(syncIndicator.offsetHeight, SYNC_FLOAT_VISIBLE_HEIGHT) + 6
                    : bottomBase;
                toast.style.bottom = bottomPos + 'px';
                requestAnimationFrame(() => {
                    toast.style.maxHeight = '110px';
                    toast.style.opacity = '1';
                    const progress = toast.querySelector('.last-sync-toast-progress');
                    if (progress) requestAnimationFrame(() => { progress.style.width = '100%'; });
                });
                setTimeout(() => {
                    toast.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
                    toast.style.maxHeight = '0';
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), SYNC_TOAST_FADE_MS);
                }, SYNC_TOAST_EXPOSURE_MS);
            }, SYNC_TOAST_SHOW_DELAY_MS);
        } catch(e) {}
    }

    // 1. Log Page Visit on Load + verificar bloqueio
    window.addEventListener('load', () => {
        checkPageLock(); // Verificar se a página está bloqueada
        showLastSyncToast();
        logActivity('PAGE_VISIT', {
            title: document.title,
            url: window.location.href
        });
    });

    // 1b. Polling de sync lock a cada 8s (detecta bloqueio e limpeza do indicador)
    setInterval(async () => {
        const hasOverlay = document.getElementById('sync-overlay') || document.getElementById('maintenance-overlay');
        if (!hasOverlay) checkPageLock();

        // Safety: se o indicador está visível mas o lock sumiu, remove diretamente
        const floatingIndicator = document.getElementById('sync-floating-indicator');
        if (floatingIndicator) {
            try {
                const pg = window.location.pathname.split('/').pop() || 'index.html';
                const resp = await fetch('/api/page-locks');
                const result = await resp.json();
                if (result.success && Array.isArray(result.data)) {
                    const lock = result.data.find(l => l.page_id === pg);
                    if (!lock || !lock.is_locked || lock.lock_reason !== 'sync') {
                        floatingIndicator.style.transition = 'all 0.5s ease-out';
                        floatingIndicator.style.transform = 'translateX(120%)';
                        floatingIndicator.style.opacity = '0';
                        setTimeout(() => { if (floatingIndicator.parentNode) floatingIndicator.remove(); }, 500);
                    }
                }
            } catch (e) {}
        }
    }, 8000);

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
