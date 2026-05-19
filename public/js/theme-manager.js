/**
 * Erus Theme Manager — Dark / Light / Classic mode
 * Persists preference in localStorage under 'erus_theme'.
 * Include in <head> of every page — applies before paint to avoid FOUC.
 */
(function () {
    var KEY = 'erus_theme';

    var CHART_DARK = {
        color:       '#a1a1aa',
        borderColor: 'rgba(255,255,255,0.05)',
        tooltip: {
            bg:    'rgba(10,10,14,0.97)',
            title: '#fbbf24',
            body:  '#f4f4f5',
            border:'rgba(251,191,36,0.3)'
        }
    };

    var CHART_LIGHT = {
        color:       '#0f172a',
        borderColor: 'rgba(0,0,0,0.15)',
        tooltip: {
            bg:    'rgba(255,255,255,0.98)',
            title: '#b45309',
            body:  '#0f172a',
            border:'rgba(0,0,0,0.2)'
        }
    };

    var CHART_CLASSIC = {
        color:       '#555555',
        borderColor: 'rgba(0,0,0,0.08)',
        tooltip: {
            bg:    'rgba(255,255,255,0.97)',
            title: '#000080',
            body:  '#000000',
            border:'rgba(0,0,0,0.25)'
        }
    };

    function applyChartDefaults(theme) {
        if (typeof Chart === 'undefined') return;
        var cfg = theme === 'light' ? CHART_LIGHT : theme === 'classic' ? CHART_CLASSIC : CHART_DARK;
        Chart.defaults.color       = cfg.color;
        Chart.defaults.borderColor = cfg.borderColor;
        if (Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
            Chart.defaults.plugins.tooltip.backgroundColor = cfg.tooltip.bg;
            Chart.defaults.plugins.tooltip.titleColor      = cfg.tooltip.title;
            Chart.defaults.plugins.tooltip.bodyColor       = cfg.tooltip.body;
            Chart.defaults.plugins.tooltip.borderColor     = cfg.tooltip.border;
        }
        // Re-render all registered charts
        Object.values(Chart.instances || {}).forEach(function(chart) {
            try { chart.update('none'); } catch(e) {}
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        // Remove existing theme overrides
        var lightLink   = document.getElementById('erus-light-theme-css');
        var classicLink = document.getElementById('erus-classic-theme-css');
        if (lightLink)   lightLink.remove();
        if (classicLink) classicLink.remove();

        if (theme === 'light') {
            var el = document.createElement('link');
            el.id   = 'erus-light-theme-css';
            el.rel  = 'stylesheet';
            el.href = 'css/light-theme.css';
            document.head.appendChild(el);
        } else if (theme === 'classic') {
            var el2 = document.createElement('link');
            el2.id   = 'erus-classic-theme-css';
            el2.rel  = 'stylesheet';
            el2.href = 'css/classic-theme.css';
            document.head.appendChild(el2);
        }

        // Update Chart.js defaults
        applyChartDefaults(theme);

        // Sync all [data-theme-toggle] buttons on the page
        document.querySelectorAll('[data-theme-toggle]').forEach(function(btn) {
            var icon  = btn.querySelector('i');
            var label = btn.querySelector('.theme-btn-label');
            if (theme === 'light') {
                if (icon)  icon.className = 'fa-solid fa-moon';
                if (label) label.textContent = 'Tema Escuro';
                btn.setAttribute('title', 'Alternar para tema escuro');
            } else if (theme === 'classic') {
                if (icon)  icon.className = 'fa-solid fa-desktop';
                if (label) label.textContent = 'Tema Escuro';
                btn.setAttribute('title', 'Alternar para tema escuro');
            } else {
                if (icon)  icon.className = 'fa-solid fa-sun';
                if (label) label.textContent = 'Tema Claro';
                btn.setAttribute('title', 'Alternar para tema claro');
            }
        });
    }

    function toggle() {
        var current = localStorage.getItem(KEY) || 'dark';
        var next    = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem(KEY, next);
        location.reload();
    }

    function init() {
        var saved = localStorage.getItem(KEY) || 'dark';
        applyTheme(saved);
    }

    // Expose globally
    window.ErusTheme = {
        toggle:  toggle,
        init:    init,
        apply:   applyTheme,
        current: function() { return localStorage.getItem(KEY) || 'dark'; }
    };

    // Apply immediately (before paint) to avoid FOUC
    init();

    // Re-run after DOM ready to sync toggle buttons rendered after this script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Inject classic-dialog.js once (for retro alert/confirm/prompt)
    function injectClassicDialog() {
        if (document.getElementById('erus-classic-dialog-js')) return;
        var s = document.createElement('script');
        s.id  = 'erus-classic-dialog-js';
        s.src = 'js/classic-dialog.js';
        document.head.appendChild(s);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectClassicDialog);
    } else {
        injectClassicDialog();
    }

    // Re-apply chart defaults AFTER all inline scripts run
    function lateChartSync() {
        var theme = localStorage.getItem(KEY) || 'dark';
        applyChartDefaults(theme);
        setTimeout(function() { applyChartDefaults(theme); }, 300);
    }
    window.addEventListener('load', lateChartSync);

    // Expose helpers so pages can read theme-aware colors
    window.ErusTheme.chartColor = function() {
        var t = localStorage.getItem(KEY) || 'dark';
        return t === 'classic' ? '#555555' : t === 'light' ? '#4b5563' : '#a1a1aa';
    };
    window.ErusTheme.chartGridColor = function() {
        var t = localStorage.getItem(KEY) || 'dark';
        return t === 'classic' ? 'rgba(0,0,0,0.08)' : t === 'light' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
    };
    window.ErusTheme.isLight = function() {
        return (localStorage.getItem(KEY) || 'dark') === 'light';
    };
    window.ErusTheme.isClassic = function() {
        return (localStorage.getItem(KEY) || 'dark') === 'classic';
    };
})();
