// public/js/cursor.js

(function() {
    // Mobile/Touch Detection
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;

    function initCursor() {
        if (!document.body || document.getElementById('cursor-parent')) return;

        // --- INITIALIZE CURSOR ELEMENTS ---
        const parent = document.createElement('div');
        parent.id = 'cursor-parent';
        
        const arrow = document.createElement('div');
        const dot = document.createElement('div');
        
        arrow.className = 'cursor-main-visual';
        dot.className = 'cursor-apex';
        
        parent.appendChild(arrow);
        parent.appendChild(dot);
        document.body.appendChild(parent);

        // --- STYLES ---
        const style = document.createElement('style');
        style.textContent = `
            body, a, button, [onclick], .kpi-card, .notif-header, .clickable, input, textarea, .editable {
                cursor: none !important;
            }

            #cursor-parent {
                position: fixed;
                top: 0; left: 0;
                pointer-events: none;
                z-index: 1000001;
                will-change: transform;
                transition: opacity 0.3s ease;
                opacity: 0;
            }

            .cursor-main-visual {
                width: 26px; height: 26px;
                background-size: contain;
                background-repeat: no-repeat;
                /* Standard Arrow SVG (Refined) */
                background-image: url("data:image/svg+xml,%3Csvg width='26' height='26' viewBox='0 0 26 26' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5 3L21 13L5 23V3Z' fill='black' stroke='%23fbbf24' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E");
                transform: rotate(-15deg);
                transform-origin: 0 0;
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-image 0.2s, width 0.2s, height 0.2s, opacity 0.2s;
                filter: drop-shadow(0 2px 5px rgba(0,0,0,0.8));
            }

            .cursor-apex {
                position: absolute;
                top: 0; left: 0;
                width: 4px; height: 4px;
                background: #fbbf24;
                border-radius: 50%;
                transform: translate(-50%, -50%);
                transition: width 0.2s, height 0.2s, background 0.2s, opacity 0.2s;
                box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
            }

            /* --- STATES --- */

            /* POINTER (Buttons/Links) */
            .cursor-pointer .cursor-main-visual {
                transform: rotate(-15deg) scale(0.8);
                filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.4));
            }
            .cursor-pointer .cursor-apex {
                width: 8px; height: 8px;
                background: #fff;
            }

            /* TEXT (Inputs/Textareas) */
            .cursor-text .cursor-main-visual {
                width: 12px; height: 24px;
                /* I-Beam SVG */
                background-image: url("data:image/svg+xml,%3Csvg width='12' height='24' viewBox='0 0 12 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 4H9M6 4V20M3 20H9' stroke='%23fbbf24' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
                transform: rotate(0deg) translate(-50%, -50%);
                opacity: 0.9;
            }
            .cursor-text .cursor-apex {
                opacity: 0; /* Hide apex dot in text mode for cleaner I-Beam */
            }
        `;
        document.head.appendChild(style);

        // --- COORDINATES ---
        window.addEventListener('mousemove', (e) => {
            const x = e.clientX;
            const y = e.clientY;
            
            parent.style.transform = `translate(${x}px, ${y}px)`;
            
            if (parent.style.opacity === '0') {
                parent.style.opacity = '1';
            }
        });

        // --- STATE DETECTION ---
        const setState = (state) => {
            parent.className = state ? `cursor-${state}` : '';
        };

        function refreshListeners() {
            // Pointer Elements
            document.querySelectorAll('a, button, [onclick], .kpi-card, .notif-header, .clickable').forEach(el => {
                if (el.dataset.cursorBound) return;
                el.dataset.cursorBound = "true";
                el.addEventListener('mouseenter', () => setState('pointer'));
                el.addEventListener('mouseleave', () => setState(null));
            });

            // Text Elements
            document.querySelectorAll('input, textarea, [contenteditable="true"], .editable-text').forEach(el => {
                if (el.dataset.cursorBoundText) return;
                el.dataset.cursorBoundText = "true";
                el.addEventListener('mouseenter', () => setState('text'));
                el.addEventListener('mouseleave', () => setState(null));
            });
        }

        setInterval(refreshListeners, 2000);
        refreshListeners();

        // --- VISIBILITY ---
        document.addEventListener('mouseleave', () => parent.style.opacity = '0');
        document.addEventListener('mouseenter', () => parent.style.opacity = '1');
    }

    if (document.body) {
        initCursor();
    } else {
        document.addEventListener('DOMContentLoaded', initCursor);
    }
})();
