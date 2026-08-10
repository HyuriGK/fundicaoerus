/* public/js/loader.js */

(function() {
    let pendingRequests = 0;
    let loaderEl = null;
    let domReady = document.readyState !== 'loading';
    let progress = 8;
    let hideTimer = null;
    let forcedDone = false;
    let slowProgressTimer = null;
    const startedAt = Date.now();
    const minVisibleMs = 650;
    const maxVisibleMs = 9000;
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html');
    const postLoginIndexLoader = currentPage === 'index.html' && sessionStorage.getItem('erus_post_login_loader') === '1';

    if (!document.getElementById('loader-css')) {
        const link = document.createElement('link');
        link.id = 'loader-css';
        link.rel = 'stylesheet';
        link.href = 'css/loader.css';
        document.head.appendChild(link);
    }

    const getPageName = () => {
        const title = (document.title || '').split('-')[0].trim();
        return title || 'Fundicao Erus';
    };

    const loaderHTML = () => `
        <div id="global-loader" aria-live="polite">
            <div class="loader-container">
                <div class="loader-top">
                    <div class="loader-logo"><i class="fa-solid fa-layer-group"></i></div>
                    <div>
                        <div class="loader-title">${getPageName()}</div>
                        <div class="loader-text" id="loader-text">Preparando painel</div>
                    </div>
                </div>
                <div class="loader-progress-bg">
                    <div id="loader-progress-fill"></div>
                </div>
                <div class="loader-steps">
                    <div class="loader-step active" data-loader-step="estrutura"><i class="fa-solid fa-cube"></i> Estrutura</div>
                    <div class="loader-step" data-loader-step="dados"><i class="fa-solid fa-database"></i> Dados</div>
                    <div class="loader-step" data-loader-step="painel"><i class="fa-solid fa-chart-column"></i> Painel</div>
                </div>
            </div>
        </div>
    `;

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function' && !window.__erusLoaderFetchPatched) {
        window.__erusLoaderFetchPatched = true;
        window.fetch = function(...args) {
            pendingRequests++;
            updateLoader('dados', 'Carregando dados', Math.max(progress, 44));
            const done = () => {
                pendingRequests = Math.max(0, pendingRequests - 1);
                scheduleHideCheck();
            };
            try {
                const request = originalFetch.apply(this, args);
                return Promise.resolve(request).finally(done);
            } catch (err) {
                done();
                throw err;
            }
        };
    }

    const injectLoader = () => {
        const path = window.location.pathname;
        const isExcluded = path.endsWith('login.html') || postLoginIndexLoader;

        if (isExcluded || document.getElementById('global-loader')) {
            document.body.style.overflow = '';
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.innerHTML = loaderHTML();
        loaderEl = wrapper.firstElementChild;
        document.body.prepend(loaderEl);
        document.body.style.overflow = 'hidden';

        startLoading(loaderEl);
        scheduleHideCheck();
    };

    const setStepState = (progress) => {
        const thresholds = [0, 38, 78];
        document.querySelectorAll('.loader-step').forEach((step, idx) => {
            const next = thresholds[idx + 1] || 101;
            step.classList.toggle('done', progress >= next || progress >= 100);
            step.classList.toggle('active', progress >= thresholds[idx] && progress < next);
        });
    };

    const updateLoader = (step, textValue, nextProgress) => {
        if (!loaderEl || loaderEl.classList.contains('fade-out')) return;
        const maxProgress = forcedDone ? 100 : 94;
        progress = Math.max(progress, Math.min(maxProgress, nextProgress || progress));
        const fill = document.getElementById('loader-progress-fill');
        const text = document.getElementById('loader-text');
        if (fill) fill.style.width = progress + '%';
        if (text && textValue) text.innerText = textValue;
        const stepProgress = step === 'estrutura' ? 18 : step === 'dados' ? 50 : 84;
        setStepState(Math.max(progress, stepProgress));
    };

    const startSlowProgress = () => {
        if (slowProgressTimer) return;
        slowProgressTimer = setInterval(() => {
            if (!loaderEl || loaderEl.classList.contains('fade-out')) {
                clearInterval(slowProgressTimer);
                slowProgressTimer = null;
                return;
            }
            if (progress >= 70 && progress < 94) {
                updateLoader('painel', 'Finalizando painel', Math.min(94, progress + 1));
            }
        }, 1000);
    };

    const hideLoader = () => {
        if (!loaderEl || loaderEl.classList.contains('fade-out')) return;
        updateLoader('painel', 'Painel pronto', 100);
        setTimeout(() => {
            if (!loaderEl) return;
            loaderEl.classList.add('fade-out');
            document.body.style.overflow = '';
            if (slowProgressTimer) {
                clearInterval(slowProgressTimer);
                slowProgressTimer = null;
            }
            setTimeout(() => {
                if (loaderEl) loaderEl.remove();
                loaderEl = null;
            }, 350);
        }, 180);
    };

    const scheduleHideCheck = () => {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            const elapsed = Date.now() - startedAt;
            if (postLoginIndexLoader && !forcedDone) {
                scheduleHideCheck();
                return;
            }
            if (elapsed >= maxVisibleMs) {
                hideLoader();
                return;
            }
            if (!domReady || pendingRequests > 0 || elapsed < minVisibleMs) {
                scheduleHideCheck();
                return;
            }
            hideLoader();
        }, forcedDone ? 80 : 350);
    };

    const startLoading = (loaderEl) => {
        const update = () => {
            if (!loaderEl || loaderEl.classList.contains('fade-out')) return;
            const loading = !domReady || pendingRequests > 0;
            const target = loading ? 70 : 94;
            const next = progress + Math.max(0.12, (target - progress) * 0.045);
            progress = loading ? Math.max(progress, Math.min(70, next)) : Math.max(progress, Math.min(94, next));
            if (pendingRequests > 0) updateLoader('dados', 'Carregando dados', progress);
            else if (domReady) {
                updateLoader('painel', progress >= 70 ? 'Finalizando painel' : 'Montando painel', progress);
                if (progress >= 70) startSlowProgress();
            }
            else updateLoader('estrutura', 'Preparando estrutura', progress);

            requestAnimationFrame(update);
        };

        requestAnimationFrame(update);
    };

    window.erusPageLoaderDone = () => {
        forcedDone = true;
        pendingRequests = 0;
        domReady = true;
        sessionStorage.removeItem('erus_post_login_loader');
        scheduleHideCheck();
    };

    if (document.body) {
        injectLoader();
    } else {
        document.addEventListener('DOMContentLoaded', injectLoader);
    }

    if (!domReady) {
        document.addEventListener('DOMContentLoaded', () => {
            domReady = true;
            updateLoader('painel', 'Montando painel', Math.max(progress, 84));
            scheduleHideCheck();
        }, { once: true });
    }
})();
