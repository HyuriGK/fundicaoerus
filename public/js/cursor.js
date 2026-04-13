// public/js/cursor.js

(function() {
    // Mobile/Touch Detection
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;

    function initCursor() {
        if (!document.body || document.getElementById('cursor-aura')) return;

        // --- INITIALIZE AURA ELEMENT ---
        const aura = document.createElement('div');
        aura.id = 'cursor-aura';
        aura.className = 'cursor-aura';
        document.body.appendChild(aura);

        // --- STYLES ---
        const style = document.createElement('style');
        style.textContent = `
            /* RESTORE STANDARD CURSOR */
            html, body, a, button, [onclick], .kpi-card, .notif-header, .clickable {
                cursor: auto !important;
            }
            a, button, [onclick], .clickable {
                cursor: pointer !important;
            }

            .cursor-aura {
                position: fixed;
                top: 0; left: 0;
                width: 400px; height: 400px;
                background: radial-gradient(circle, rgba(251, 191, 36, 0.07) 0%, transparent 70%);
                border-radius: 50%;
                pointer-events: none;
                z-index: 999998; /* Just below loader (999999) and interactive elements */
                transform: translate(-50%, -50%);
                mix-blend-mode: screen;
                opacity: 0;
                transition: opacity 0.5s ease;
                will-change: transform;
            }

            /* Premium Interaction State */
            .aura-active .cursor-aura {
                background: radial-gradient(circle, rgba(251, 191, 36, 0.12) 0%, transparent 70%);
                width: 300px; height: 300px;
            }
            
            /* Magnetic subtle reaction on elements */
            a:hover, button:hover, .kpi-card:hover, .notif-header:hover {
                transform: scale(1.02);
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }
        `;
        document.head.appendChild(style);

        // --- COORDINATES ---
        let mouse = { x: -500, y: -500 };
        
        // --- EVENTS ---
        window.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            
            // Move the aura
            aura.style.transform = `translate(${mouse.x}px, ${mouse.y}px)`;
            if (aura.style.opacity === '0') aura.style.opacity = '1';
        });

        const handleInteractEnter = () => document.body.classList.add('aura-active');
        const handleInteractLeave = () => document.body.classList.remove('aura-active');

        function refreshListeners() {
            const interactive = document.querySelectorAll('a, button, [onclick], .kpi-card, .notif-header, .clickable');
            interactive.forEach(el => {
                if (el.dataset.auraBound) return;
                el.dataset.auraBound = "true";
                el.addEventListener('mouseenter', handleInteractEnter);
                el.addEventListener('mouseleave', handleInteractLeave);
            });
        }

        setInterval(refreshListeners, 2000);
        refreshListeners();

        // --- VISIBILITY HANDLING ---
        document.addEventListener('mouseleave', () => {
            aura.style.opacity = '0';
        });
        document.addEventListener('mouseenter', () => {
            aura.style.opacity = '1';
        });
    }

    if (document.body) {
        initCursor();
    } else {
        document.addEventListener('DOMContentLoaded', initCursor);
    }
})();
