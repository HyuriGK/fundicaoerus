// public/js/cursor.js

(function() {
    // Mobile/Touch Detection
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;

    // --- INITIALIZE CURSOR ELEMENTS ---
    const dot = document.createElement('div');
    const ring = document.createElement('div');
    
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    // --- STYLES ---
    const style = document.createElement('style');
    style.textContent = `
        body { 
            cursor: none !important; 
        }
        a, button, [onclick], .kpi-card, .notif-header, .clickable {
            cursor: none !important;
        }

        .cursor-dot {
            position: fixed;
            top: 0; left: 0;
            width: 8px; height: 8px;
            background: #fbbf24;
            border-radius: 50%;
            pointer-events: none;
            z-index: 100000;
            transition: transform 0.1s ease-out;
            transform: translate(-50%, -50%);
        }

        .cursor-ring {
            position: fixed;
            top: 0; left: 0;
            width: 32px; height: 32px;
            border: 2px solid rgba(251, 191, 36, 0.4);
            border-radius: 50%;
            pointer-events: none;
            z-index: 99999;
            transform: translate(-50%, -50%);
            transition: width 0.3s ease, height 0.3s ease, border 0.3s ease, background 0.3s ease;
            box-shadow: 0 0 10px rgba(251, 191, 36, 0.1);
        }

        /* Hover States */
        .cursor-active .cursor-ring {
            width: 60px;
            height: 60px;
            background: rgba(251, 191, 36, 0.1);
            border-color: rgba(251, 191, 36, 0.6);
            box-shadow: 0 0 20px rgba(251, 191, 36, 0.2);
        }
        
        .cursor-active .cursor-dot {
            transform: translate(-50%, -50%) scale(0.5);
        }
+    `;
    document.head.appendChild(style);

    // --- COORDINATES ---
    let mouse = { x: -100, y: -100 };
    let ringPos = { x: -100, y: -100 };
    
    // Animation Speed (Lerp)
    const lerp = (start, end, factor) => start + (end - start) * factor;

    // --- EVENTS ---
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        
        // Immediate dot update
        dot.style.left = mouse.x + 'px';
        dot.style.top = mouse.y + 'px';
    });

    // Handle Hovering over interactive elements
    const handleInteractEnter = () => document.body.classList.add('cursor-active');
    const handleInteractLeave = () => document.body.classList.remove('cursor-active');

    function refreshListeners() {
        const interactive = document.querySelectorAll('a, button, [onclick], .kpi-card, .notif-header, .clickable');
        interactive.forEach(el => {
            el.addEventListener('mouseenter', handleInteractEnter);
            el.addEventListener('mouseleave', handleInteractLeave);
        });
    }

    // Refresh listeners periodically to catch dynamic elements
    setInterval(refreshListeners, 2000);
    refreshListeners();

    // --- ANIMATION LOOP ---
    function animate() {
        // Linear Interpolation for the ring (Trailing effect)
        ringPos.x = lerp(ringPos.x, mouse.x, 0.15);
        ringPos.y = lerp(ringPos.y, mouse.y, 0.15);
        
        ring.style.left = ringPos.x + 'px';
        ring.style.top = ringPos.y + 'px';
        
        requestAnimationFrame(animate);
    }
    
    animate();

    // --- HIDE ON LOGOUT OR LEAVE ---
    window.addEventListener('mouseout', (e) => {
        if (!e.relatedTarget && !e.toElement) {
            dot.style.opacity = '0';
            ring.style.opacity = '0';
        }
    });
    window.addEventListener('mouseover', () => {
        dot.style.opacity = '1';
        ring.style.opacity = '1';
    });

})();
