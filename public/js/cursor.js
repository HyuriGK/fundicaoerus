// public/js/cursor.js

(function() {
    // Mobile/Touch Detection
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;

    function initCursor() {
        if (!document.body || document.getElementById('cursor-arrow')) return;

        // --- INITIALIZE CURSOR ELEMENTS ---
        const arrow = document.createElement('div');
        const dot = document.createElement('div');
        
        arrow.id = 'cursor-arrow';
        arrow.className = 'cursor-arrow';
        dot.id = 'cursor-apex';
        dot.className = 'cursor-apex';
        
        document.body.appendChild(arrow);
        document.body.appendChild(dot);

        // --- STYLES ---
        const style = document.createElement('style');
        style.textContent = `
            body, a, button, [onclick], .kpi-card, .notif-header, .clickable {
                cursor: none !important;
            }

            .cursor-arrow {
                position: fixed;
                top: 0; left: 0;
                width: 24px; height: 24px;
                background-image: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4.5 3L18 12L4.5 21V3Z' fill='black' stroke='%23fbbf24' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E");
                background-size: contain;
                background-repeat: no-repeat;
                pointer-events: none;
                z-index: 1000001; /* Above everything */
                /* Rotated to point up-left slightly for classic feel */
                transform-origin: 0 0;
                transform: rotate(-15deg);
                opacity: 0;
                transition: opacity 0.3s ease, width 0.2s, height 0.2s;
                will-change: transform;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
            }

            .cursor-apex {
                position: fixed;
                top: 0; left: 0;
                width: 4px; height: 4px;
                background: #fbbf24;
                border-radius: 50%;
                pointer-events: none;
                z-index: 1000002;
                transform: translate(-50%, -50%);
                opacity: 0;
                transition: opacity 0.3s ease;
                box-shadow: 0 0 5px rgba(251, 191, 36, 0.8);
            }

            /* Professional Interaction State */
            .cursor-active .cursor-arrow {
                width: 20px; height: 20px;
                filter: drop-shadow(0 4px 8px rgba(251, 191, 36, 0.3));
            }
            .cursor-active .cursor-apex {
                background: #fff;
                width: 6px; height: 6px;
            }
        `;
        document.head.appendChild(style);

        // --- EVENTS ---
        window.addEventListener('mousemove', (e) => {
            const x = e.clientX;
            const y = e.clientY;
            
            // Positioning (Arrow tip is the reference)
            arrow.style.left = x + 'px';
            arrow.style.top = y + 'px';
            
            dot.style.left = x + 'px';
            dot.style.top = y + 'px';

            if (arrow.style.opacity === '0') {
                arrow.style.opacity = '1';
                dot.style.opacity = '1';
            }
        });

        const handleInteractEnter = () => document.body.classList.add('cursor-active');
        const handleInteractLeave = () => document.body.classList.remove('cursor-active');

        function refreshListeners() {
            const interactive = document.querySelectorAll('a, button, [onclick], .kpi-card, .notif-header, .clickable');
            interactive.forEach(el => {
                if (el.dataset.arrowBound) return;
                el.dataset.arrowBound = "true";
                el.addEventListener('mouseenter', handleInteractEnter);
                el.addEventListener('mouseleave', handleInteractLeave);
            });
        }

        setInterval(refreshListeners, 2000);
        refreshListeners();

        // --- VISIBILITY ---
        document.addEventListener('mouseleave', () => {
            arrow.style.opacity = '0';
            dot.style.opacity = '0';
        });
        document.addEventListener('mouseenter', () => {
            arrow.style.opacity = '1';
            dot.style.opacity = '1';
        });
    }

    if (document.body) {
        initCursor();
    } else {
        document.addEventListener('DOMContentLoaded', initCursor);
    }
})();
