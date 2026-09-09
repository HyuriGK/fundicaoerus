(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const palette = () => {
        const style = getComputedStyle(document.documentElement);
        const value = name => style.getPropertyValue(name).trim();
        return {
            text: value('--text-muted'),
            ink: value('--text-main'),
            grid: value('--border-subtle'),
            surface: value('--bg-card'),
            amber: value('--chart-billing'),
            scrap: value('--status-danger')
        };
    };

    if (window.Chart) {
        Chart.register({
            id: 'erusProcessDesign',
            beforeUpdate(chart) {
                const colors = palette();
                chart.options.color = colors.text;
                chart.options.font = { ...chart.options.font, family: 'DM Sans', size: 11 };
                chart.options.animation = motion.matches ? false : { duration: 450 };
                const tooltip = chart.options.plugins.tooltip;
                Object.assign(tooltip, {
                    backgroundColor: colors.surface,
                    titleColor: colors.ink,
                    bodyColor: colors.text,
                    borderColor: colors.grid,
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    titleFont: { family: 'Manrope', weight: '600' },
                    bodyFont: { family: 'DM Sans', size: 11 }
                });
                Object.values(chart.options.scales || {}).forEach(scale => {
                    scale.ticks.color = colors.text;
                    scale.ticks.font = { family: 'DM Sans', size: 10 };
                    scale.grid.color = colors.grid;
                    scale.border.display = false;
                });
                chart.data.datasets.forEach(dataset => {
                    dataset.backgroundColor = chart.canvas.id === 'scrapChart' ? colors.scrap : colors.amber;
                    dataset.borderColor = dataset.backgroundColor;
                    dataset.borderRadius = 4;
                    dataset.borderSkipped = false;
                    dataset.maxBarThickness = chart.canvas.id === 'scrapChart' ? 20 : 24;
                });
            }
        });
    }

    function updateCharts() {
        Object.values(window.Chart?.instances || {}).forEach(chart => chart.update('none'));
    }
    new MutationObserver(updateCharts).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    motion.addEventListener('change', updateCharts);

    function prepareSidebar() {
        const brand = document.querySelector('#erus-sidebar .erus-brand-text');
        if (brand) {
            brand.querySelector('h1').textContent = 'FUNDIÇÃO ERUS';
            brand.querySelector('p').textContent = 'SISTEMA DE GERENCIAMENTO DE PROCESSOS';
        }
        const image = document.querySelector('#erus-sidebar .erus-brand-icon img');
        if (image) image.src = 'logo-centered.png';
        const brandLink = document.getElementById('erus-brand');
        if (brandLink) brandLink.href = 'index1.html';
        const home = document.querySelector('#erus-sidebar .erus-nav-link[href="index.html"]');
        if (home) {
            home.href = 'index1.html';
            home.classList.add('active');
            home.setAttribute('aria-current', 'page');
        }
    }
    if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', prepareSidebar);
    else prepareSidebar();
})();
