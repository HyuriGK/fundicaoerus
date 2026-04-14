import os
import re

path = r'c:\Users\brasi\Desktop\server\public\pedidos.html'

def fix_pedidos():
    with open(path, 'rb') as f:
        # Read raw and decode ignoring errors to skip corrupted nulls or similar
        content = f.read().decode('utf-8', errors='ignore')

    # 1. Fix 'POSIÇÃO INDUSTRIAL' button (if still broken, but should be fixed)
    content = re.sub(r'POSI.*?O INDUSTRIAL', 'POSIÇÃO INDUSTRIAL', content)

    # 2. Fix 'GRÁFICOS DE EMISSÃO' button
    # Match the whole button content if possible
    btn_regex = r'<button class="btn-action-standard" onclick="toggleCharts\(\); this\.blur\(\)" id="btn-toggle-charts">\s*<i class="fa-solid fa-chart-line"></i>\s*GR.*?FICOS DE EMISS.*?O\s*</button>'
    replacement = '<button class="btn-action-standard" onclick="toggleCharts(); this.blur()" id="btn-toggle-charts">\n                    <i class="fa-solid fa-chart-line"></i>\n                    GRÁFICOS DE EMISSÃO\n                </button>'
    content = re.sub(btn_regex, replacement, content, flags=re.MULTILINE | re.DOTALL)

    # 3. Fix 'CÓDIGO' header
    content = re.sub(r'<th style="width: 7%; text-align: center;">C.*?DIGO</th>', '<th style="width: 7%; text-align: center;">CÓDIGO</th>', content)

    # 4. Fix 'Informações' comment/header
    content = re.sub(r'Informa.*?es do Pedido', 'Informações do Pedido', content)
    
    # 5. Generic mojibake cleanup for the rest
    mojibake = {
        'Ã‡Ãƒ': 'ÇÃO',
        'ÃƒÂ ': 'Á',
        'ÃƒÂƒ': 'Ã',
        'ÃƒÂ§': 'ç',
        'ÃƒÂµ': 'õ',
        'ÃƒÂ³': 'ó',
        'ÃƒÂª': 'ê',
        'ÃƒÂ‰': 'É',
        'Ã‡': 'Ç',
        'Ãƒ': 'Ã',
        'Ã“': 'Ó',
        'Ãš': 'Ú',
        'Ãª': 'ê',
        'Ãµ': 'õ'
    }
    for old, new in mojibake.items():
        content = content.replace(old, new)

    # Write back as clean UTF-8
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed pedidos.html")

if __name__ == "__main__":
    fix_pedidos()
