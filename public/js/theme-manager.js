/**
 * Erus Theme Manager — Light / Dark mode
 * Persists preference in localStorage under 'erus_theme'.
 * Apply on every page by including this script in <head>.
 */
(function () {
    const KEY = 'erus_theme';

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const link = document.getElementById('erus-light-theme-css');
        if (theme === 'light') {
            if (!link) {
                const el = document.createElement('link');
                el.id = 'erus-light-theme-css';
                el.rel = 'stylesheet';
                el.href = 'css/light-theme.css';
                document.head.appendChild(el);
            }
        } else {
            if (link) link.remove();
        }
        // Sync any toggle buttons on the page
        document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
            const icon = btn.querySelector('i');
            const label = btn.querySelector('.theme-btn-label');
            if (theme === 'light') {
                if (icon) { icon.className = 'fa-solid fa-moon'; }
                if (label) label.textContent = 'Tema Escuro';
                btn.setAttribute('title', 'Alternar para tema escuro');
            } else {
                if (icon) { icon.className = 'fa-solid fa-sun'; }
                if (label) label.textContent = 'Tema Claro';
                btn.setAttribute('title', 'Alternar para tema claro');
            }
        });
    }

    function toggle() {
        const current = localStorage.getItem(KEY) || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem(KEY, next);
        applyTheme(next);
    }

    function init() {
        const saved = localStorage.getItem(KEY) || 'dark';
        applyTheme(saved);
    }

    // Expose globally
    window.ErusTheme = { toggle, init, apply: applyTheme, current: () => localStorage.getItem(KEY) || 'dark' };

    // Apply immediately to avoid FOUC
    init();

    // Re-apply after DOM is ready (syncs buttons)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
