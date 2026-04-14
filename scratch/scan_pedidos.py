content = open('public/pedidos.html', encoding='utf-8').read()
lines = content.split('\n')
results = []
for i, line in enumerate(lines, 1):
    l = line.lower()
    if any(k in l for k in ['industrial', 'emiss', 'canvas', 'chart-panel', 'chart_wrap', 'chart-wrap', 'height']):
        results.append(f'{i}: {line[:120]}')
for r in results[:60]:
    print(r)
