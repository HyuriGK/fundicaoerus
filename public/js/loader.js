/* public/js/loader.js */

(function() {
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

    const injectLoader = () => {
        const path = window.location.pathname;
        const isExcluded = path.endsWith('login.html');

        if (isExcluded || document.getElementById('global-loader')) {
            document.body.style.overflow = '';
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.innerHTML = loaderHTML();
        const loaderEl = wrapper.firstElementChild;
        document.body.prepend(loaderEl);
        document.body.style.overflow = 'hidden';

        startLoading(loaderEl);
    };

    const setStepState = (progress) => {
        const thresholds = [0, 38, 78];
        document.querySelectorAll('.loader-step').forEach((step, idx) => {
            const next = thresholds[idx + 1] || 101;
            step.classList.toggle('done', progress >= next || progress >= 100);
            step.classList.toggle('active', progress >= thresholds[idx] && progress < next);
        });
    };

    const startLoading = (loaderEl) => {
        const fill = document.getElementById('loader-progress-fill');
        const text = document.getElementById('loader-text');
        const duration = 900;
        const startTime = Date.now();

        const update = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min((elapsed / duration) * 100, 100);

            if (fill) fill.style.width = progress + '%';
            if (text) {
                if (progress < 38) text.innerText = 'Preparando estrutura';
                else if (progress < 78) text.innerText = 'Carregando dados';
                else text.innerText = 'Montando painel';
            }
            setStepState(progress);

            if (progress < 100) {
                requestAnimationFrame(update);
            } else {
                setTimeout(() => {
                    loaderEl.classList.add('fade-out');
                    document.body.style.overflow = '';
                    setTimeout(() => loaderEl.remove(), 350);
                }, 80);
            }
        };

        requestAnimationFrame(update);
    };

    if (document.body) {
        injectLoader();
    } else {
        document.addEventListener('DOMContentLoaded', injectLoader);
    }
})();
