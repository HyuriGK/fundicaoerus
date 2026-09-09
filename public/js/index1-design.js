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
                chart.options.interaction = { mode: 'index', intersect: false };
                const tooltip = chart.options.plugins.tooltip;
                Object.assign(tooltip, {
                    backgroundColor: colors.surface,
                    titleColor: colors.ink,
                    bodyColor: colors.text,
                    borderColor: colors.grid,
                    borderWidth: 1,
                    cornerRadius: 10,
                    padding: 14,
                    caretSize: 5,
                    titleMarginBottom: 8,
                    titleFont: { family: 'Manrope', weight: '600' },
                    bodyFont: { family: 'DM Sans', size: 11 }
                });
                Object.values(chart.options.scales || {}).forEach(scale => {
                    scale.ticks.color = colors.text;
                    scale.ticks.font = { family: 'DM Sans', size: 10 };
                    scale.grid.color = colors.grid;
                    scale.grid.drawTicks = false;
                    scale.ticks.padding = 9;
                    scale.border.display = false;
                    scale.border.dash = [3, 5];
                });
                if (chart.canvas.id === 'scrapChart') {
                    chart.options.scales.y.grid.display = false;
                    chart.options.scales.y.ticks.callback = function(value) {
                        const label = String(this.getLabelForValue(value));
                        return label.length > 24 ? label.slice(0, 23) + '…' : label;
                    };
                }
                chart.data.datasets.forEach(dataset => {
                    dataset.backgroundColor = chart.canvas.id === 'scrapChart' ? colors.scrap : colors.amber;
                    dataset.borderColor = dataset.backgroundColor;
                    dataset.borderRadius = 5;
                    dataset.borderSkipped = false;
                    dataset.maxBarThickness = chart.canvas.id === 'scrapChart' ? 16 : 22;
                    dataset.hoverBackgroundColor = chart.canvas.id === 'scrapChart' ? '#eba8a0' : '#f5ce86';
                });
            },
            afterDraw(chart) {
                const values = chart.data.datasets.flatMap(dataset => dataset.data);
                if (values.some(value => Number.isFinite(Number(value)) && Number(value) !== 0)) return;
                const { ctx, chartArea } = chart;
                const x = (chartArea.left + chartArea.right) / 2;
                const y = (chartArea.top + chartArea.bottom) / 2;
                ctx.save();
                ctx.font = '12px "DM Sans", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const message = values.length ? 'Nenhum volume no período' : 'Sem registros para exibir';
                const width = ctx.measureText(message).width;
                ctx.fillStyle = palette().surface;
                ctx.fillRect(x - width / 2 - 12, y - 16, width + 24, 32);
                ctx.fillStyle = palette().text;
                ctx.fillText(message, x, y);
                ctx.restore();
            }
        });
    }

    function updateCharts() {
        Object.values(window.Chart?.instances || {}).forEach(chart => chart.update('none'));
    }
    new MutationObserver(updateCharts).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    motion.addEventListener('change', updateCharts);

    function prepareSidebar() {
        document.body.dataset.processRole = (localStorage.getItem('erus_role') || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
        const period = document.getElementById('processPeriod');
        if (period) {
            const now = new Date();
            period.dateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            period.textContent = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        }
        const percent = document.getElementById('meta-progress-pct');
        const track = document.getElementById('metaProgressTrack');
        const fill = document.getElementById('metaProgressFill');
        if (percent && track && fill) {
            const updateProgress = () => {
                const value = Number.parseFloat(percent.textContent.replace(',', '.'));
                track.hidden = !Number.isFinite(value);
                fill.style.setProperty('--meta-progress', String(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) / 100 : 0));
                track.classList.toggle('is-complete', value >= 100);
            };
            new MutationObserver(updateProgress).observe(percent, { childList: true, characterData: true, subtree: true });
            updateProgress();
        }
    }
    if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', prepareSidebar);
    else prepareSidebar();
})();
