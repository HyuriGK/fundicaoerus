content = open('public/pedidos.html', encoding='utf-8').read()
lines = content.split('\n')
out = open('scratch/pedidos_layout_scan.txt', 'w', encoding='utf-8')
for i, line in enumerate(lines, 1):
    if any(k in line for k in ['toggleCharts', 'toggleIndustrial', 'chartRow1', 'chartRow2',
                                 'industrialProgressContainer', 'charts-row', 'dashboard-content',
                                 'overflow', 'flex-shrink', 'flex: 1', 'kpi-row']):
        out.write(f'{i}: {line[:140]}\n')
out.close()
print('Done')
