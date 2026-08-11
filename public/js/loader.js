/* public/js/loader.js */

(function() {
    const kpiSnapshotSentAt = new Map();
    const kpiSnapshotTimers = new Map();
    window.erusReportKpiSnapshot = (metricKey, sourceKey, contextKey, metricLabel, value, unit, pageUrl) => {
        const numericValue = Number(value);
        if (!metricKey || !contextKey || !Number.isFinite(numericValue)) return;
        const snapshotKey = `${metricKey}:${sourceKey}:${contextKey}`;
        clearTimeout(kpiSnapshotTimers.get(snapshotKey));
        kpiSnapshotTimers.set(snapshotKey, setTimeout(() => {
            const cacheKey = `${snapshotKey}:${numericValue}`;
            const now = Date.now();
            if (now - (kpiSnapshotSentAt.get(cacheKey) || 0) < 30000) return;
            kpiSnapshotSentAt.set(cacheKey, now);
            fetch('/api/producao-postgres/kpi-snapshot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (localStorage.getItem('erus_token') || '')
                },
                body: JSON.stringify({ metricKey, sourceKey, contextKey, metricLabel, value: numericValue, unit, pageUrl }),
                keepalive: true
            }).catch(() => {});
            kpiSnapshotTimers.delete(snapshotKey);
        }, 1500));
    };

    const shouldDisableAutocomplete = (el) => {
        if (!el || el.dataset.allowAutocomplete === 'true' || el.hasAttribute('list')) return false;
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'textarea') return true;
        if (tag !== 'input') return false;
        const type = String(el.getAttribute('type') || 'text').toLowerCase();
        return ['text', 'search', 'email', 'password', 'number', 'tel', 'url', 'date', 'time', 'month', 'week', 'datetime-local'].includes(type);
    };

    const disableAutocomplete = (root) => {
        const scope = root && root.querySelectorAll ? root : document;
        if (shouldDisableAutocomplete(root)) {
            root.setAttribute('autocomplete', 'off');
            root.setAttribute('autocorrect', 'off');
            root.setAttribute('autocapitalize', 'off');
            root.setAttribute('spellcheck', 'false');
        }
        scope.querySelectorAll('input, textarea').forEach((el) => {
            if (!shouldDisableAutocomplete(el)) return;
            el.setAttribute('autocomplete', 'off');
            el.setAttribute('autocorrect', 'off');
            el.setAttribute('autocapitalize', 'off');
            el.setAttribute('spellcheck', 'false');
        });
    };

    const stableSurfaceSelector = [
        '.kpi-card',
        '.metric-card',
        '.stat-card',
        '.chart-panel',
        '.chart-card',
        '.chart-container',
        '.chart-wrapper',
        '.table-card',
        '.table-container',
        '.table-wrapper',
        '.native-admin-tablewrap'
    ].join(',');

    const reserveSurfaceHeight = (el) => {
        if (!el || !el.getBoundingClientRect || el.closest('#global-loader')) return;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const rect = el.getBoundingClientRect();
        const maxHeight = Math.max(180, window.innerHeight * 0.9);
        if (rect.height < 32 || rect.height > maxHeight) return;
        el.style.setProperty('--erus-stable-min-height', `${Math.ceil(rect.height)}px`);
        el.classList.add('erus-stable-surface');
    };

    const stabilizeSurfaces = (root = document) => {
        if (root.matches && root.matches(stableSurfaceSelector)) reserveSurfaceHeight(root);
        if (!root.querySelectorAll) return;
        root.querySelectorAll(stableSurfaceSelector).forEach(reserveSurfaceHeight);
    };

    const unlockActionSize = (button) => {
        if (!button || button.disabled || button.querySelector('.fa-spin, .spinner, [class*="loading"]')) return;
        button.classList.remove('erus-action-size-locked');
        button.style.removeProperty('--erus-action-width');
        button.style.removeProperty('--erus-action-height');
    };

    const lockActionSize = (event) => {
        const button = event.target.closest && event.target.closest('button, [role="button"]');
        if (!button || button.closest('#global-loader')) return;
        const rect = button.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 20) return;
        button.style.setProperty('--erus-action-width', `${Math.ceil(rect.width)}px`);
        button.style.setProperty('--erus-action-height', `${Math.ceil(rect.height)}px`);
        button.classList.add('erus-action-size-locked');
        setTimeout(() => unlockActionSize(button), 120);
    };

    const initLayoutStability = () => {
        document.documentElement.classList.add('erus-layout-stability');
        requestAnimationFrame(() => stabilizeSurfaces(document));
        document.addEventListener('click', lockActionSize, true);

        if (!window.MutationObserver) return;
        new MutationObserver((mutations) => {
            const addedRoots = new Set();
            const changedButtons = new Set();
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) addedRoots.add(node);
                });
                const button = mutation.target.closest && mutation.target.closest('button, [role="button"]');
                if (button) changedButtons.add(button);
            });
            addedRoots.forEach(root => requestAnimationFrame(() => stabilizeSurfaces(root)));
            changedButtons.forEach(button => setTimeout(() => unlockActionSize(button), 60));
        }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    };

    const initAutocompleteGuard = () => {
        disableAutocomplete(document);
        if (!window.MutationObserver) return;
        new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) disableAutocomplete(node);
                });
            });
        }).observe(document.documentElement, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initAutocompleteGuard();
            initLayoutStability();
        });
    } else {
        initAutocompleteGuard();
        initLayoutStability();
    }

    let pendingRequests = 0;
    let loaderEl = null;
    let domReady = document.readyState !== 'loading';
    let progress = 0;
    let hideTimer = null;
    let forcedDone = false;
    let slowProgressTimer = null;
    const startedAt = Date.now();
    const minVisibleMs = 1700;
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
            if (loaderEl && progress >= 24) updateLoader('dados', 'Carregando dados', progress);
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

        updateLoader('estrutura', 'Preparando estrutura', 0);
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
            const elapsed = Date.now() - startedAt;
            let target = 25;
            if (elapsed >= 450) target = 50;
            if (elapsed >= 1000) target = 70;
            if (elapsed >= 1700 && !loading) target = 94;
            const next = progress + Math.max(0.12, (target - progress) * 0.045);
            progress = Math.max(progress, Math.min(target, next));
            if (progress < 25) updateLoader('estrutura', 'Preparando estrutura', progress);
            else if (progress < 50 || pendingRequests > 0) updateLoader('dados', 'Carregando dados', progress);
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
            updateLoader('painel', 'Montando painel', progress);
            scheduleHideCheck();
        }, { once: true });
    }
})();
