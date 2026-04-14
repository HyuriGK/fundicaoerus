import os
import re

files = [
    (r'public/index.html', 'Administração'),
    (r'public/pedidos.html', 'Pedidos'),
    (r'public/faturamentos.html', 'Faturamentos'),
    (r'public/devolucoes.html', 'Devoluções'),
    (r'public/refugos.html', 'Gestão de Refugo'),
    (r'public/acabamento_externo.html', 'Acabamento Externo')
]

def surgical_repair(rel_path, title_hint):
    base_path = r'c:\Users\brasi\Desktop\server'
    path = os.path.join(base_path, rel_path)
    if not os.path.exists(path): return

    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()

    for i in range(len(lines)):
        # Repair titles
        if '<title>' in lines[i]:
            if 'Erus' in lines[i]:
                lines[i] = f'    <title>{title_hint} - Fundição Erus</title>\n'
        
        # Repair specific known broken KPIs
        if 'kpi-title' in lines[i]:
            if 'Produ' in lines[i] and 'Total' in lines[i] and 'FUS' in lines[i]:
                lines[i] = '                    <div class="kpi-title">Produção Total (FUSÃO)</div>\n'
            if 'Refugo' in lines[i] and 'Total' in lines[i]:
                 lines[i] = '                    <div class="kpi-title">Refugo Total</div>\n'
        
        # Repair sidebar titles
        if 'side-menu-title' in lines[i]:
            if 'Op' in lines[i] and 'es' in lines[i]:
                lines[i] = '            <div class="side-menu-title">Opções</div>\n'
        
        if 'side-menu-subtitle' in lines[i]:
            if 'DEVOLU' in lines[i]:
                lines[i] = '            <div class="side-menu-subtitle">DEVOLUÇÕES</div>\n'
            if 'PEDID' in lines[i]:
                lines[i] = '            <div class="side-menu-subtitle">PEDIDOS</div>\n'

    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print(f"Reparo cirúrgico concluído para {rel_path}")

for f, hint in files:
    surgical_repair(f, hint)
