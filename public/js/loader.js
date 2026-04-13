/* public/js/loader.js */

(function() {
    // 1. Injetar o CSS do Loader (caso não tenha sido injetado via link tag)
    if (!document.getElementById('loader-css')) {
        const link = document.createElement('link');
        link.id = 'loader-css';
        link.rel = 'stylesheet';
        link.href = 'css/loader.css';
        document.head.appendChild(link);
    }

    // 2. Criar a estrutura HTML do Loader
    const loaderHTML = `
        <div id="global-loader">
            <div class="loader-container">
                <div class="loader-logo">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <div class="loader-text">CARREGANDO INFORMAÇÕES</div>
                <div class="loader-progress-bg">
                    <div id="loader-progress-fill"></div>
                </div>
                <div class="loader-percentage" id="loader-perc">0%</div>
            </div>
        </div>
    `;

    // 3. Injetar o HTML no início do body
    const injectLoader = () => {
        const path = window.location.pathname;
        const isExcluded = path.endsWith('login.html') || path.endsWith('index.html') || path === '/';
        
        if (isExcluded || document.getElementById('global-loader')) {
             if (isExcluded) document.body.style.overflow = '';
             return;
        }
        
        const wrapper = document.createElement('div');
        wrapper.innerHTML = loaderHTML;
        const loaderEl = wrapper.firstElementChild;
        document.body.prepend(loaderEl);
        
        // Bloquear scroll
        document.body.style.overflow = 'hidden';

        startLoading(loaderEl);
    };

    // 4. Lógica de Simulação (1 segundo)
    const startLoading = (loaderEl) => {
        const fill = document.getElementById('loader-progress-fill');
        const percText = document.getElementById('loader-perc');
        const duration = 1000; // Alterado para 1.0 segundo
        const startTime = Date.now();

        const update = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min((elapsed / duration) * 100, 100);

            if (fill) fill.style.width = progress + '%';
            if (percText) percText.innerText = Math.round(progress) + '%';

            if (progress < 100) {
                requestAnimationFrame(update);
            } else {
                // Finalizado!
                setTimeout(() => {
                    loaderEl.classList.add('fade-out');
                    document.body.style.overflow = ''; // Restaurar scroll
                    
                    // Remover do DOM após a transição de fade-out
                    setTimeout(() => {
                        loaderEl.remove();
                    }, 400); // Mais rápido
                }, 100); // Mais rápido
            }
        };

        requestAnimationFrame(update);
    };

    if (document.body) {
        injectLoader();
    } else {
        document.addEventListener('DOMContentLoaded', injectLoader);
    }

    // 5. Injetar o Cursor Customizado (Global)
    const cursorScript = document.createElement('script');
    cursorScript.src = 'js/cursor.js';
    document.head.appendChild(cursorScript);
})();
