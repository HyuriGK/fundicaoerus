// public/js/cursor.js

(function() {
    // Mobile/Touch Detection
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;

    function initCursor() {
        if (!document.body || document.getElementById('cursor-dot')) return;

        // --- INITIALIZE CURSOR ELEMENTS ---
        const dot = document.createElement('div');
        const halo = document.createElement('div');
        
        dot.id = 'cursor-dot';
        dot.className = 'cursor-dot';
        halo.id = 'cursor-halo';
        halo.className = 'cursor-halo';
        
        document.body.appendChild(dot);
        document.body.appendChild(halo);

        // --- STYLES ---
        const style = document.createElement('style');
        style.textContent = `
            body, a, button, [onclick], .kpi-card, .notif-header, .clickable {
                cursor: none !important;
            }

            .cursor-dot {
                position: fixed;
                top: 0; left: 0;
                width: 6px; height: 6px;
                background: #fbbf24;
                border-radius: 50%;
                pointer-events: none;
                z-index: 1000001;
                transform: translate(-50%, -50%);
                transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s;
            }

            .cursor-halo {
                position: fixed;
                top: 0; left: 0;
                width: 30px; height: 30px;
                border: 1px solid rgba(251, 191, 36, 0.5);
                border-radius: 50%;
                pointer-events: none;
                z-index: 1000000;
                transform: translate(-50%, -50%) scale(0);
                opacity: 0;
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s;
            }

            /* Professional Interaction State */
            .cursor-active .cursor-halo {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
                background: rgba(251, 191, 36, 0.05);
            }
            
            .cursor-active .cursor-dot {
                background: #fff;
                transform: translate(-50%, -50%) scale(0.8);
                box-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
            }
        `;
        document.head.appendChild(style);

        // --- EVENTS ---
        window.addEventListener('mousemove', (e) => {
            const x = e.clientX;
            const y = e.clientY;
            
            // Instant positioning for both elements (Professional feel: Zero delay)
            dot.style.transform = `translate(${x}px, ${y}px)`;
            halo.style.transform = `translate(${x}px, ${y}px) scale(${document.body.classList.contains('cursor-active') ? 1 : 0})`;
            
            // Fallback for older browsers if needed
            dot.style.left = '0';
            dot.style.top = '0';
            halo.style.left = '0';
            halo.style.top = '0';
        });

        const handleInteractEnter = () => {
            document.body.classList.add('cursor-active');
        };
        const handleInteractLeave = () => {
            document.body.classList.remove('cursor-active');
        };

        function refreshListeners() {
            const interactive = document.querySelectorAll('a, button, [onclick], .kpi-card, .notif-header, .clickable');
            interactive.forEach(el => {
                if (el.dataset.cursorBound) return;
                el.dataset.cursorBound = "true";
                el.addEventListener('mouseenter', handleInteractEnter);
                el.addEventListener('mouseleave', handleInteractLeave);
            });
        }

        setInterval(refreshListeners, 2000);
        refreshListeners();

        // --- VISIBILITY HANDLING ---
        window.addEventListener('mouseout', (e) => {
            if (!e.relatedTarget && !e.toElement) {
                dot.style.opacity = '0';
                halo.style.opacity = '0';
            }
        });
        window.addEventListener('mouseover', () => {
            dot.style.opacity = '1';
            // Halo opacity is handled by the scale/activity class
        });
    }

    if (document.body) {
        initCursor();
    } else {
        document.addEventListener('DOMContentLoaded', initCursor);
    }
})();
