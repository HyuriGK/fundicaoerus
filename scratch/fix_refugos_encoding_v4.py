import os
import re

path = r'c:\Users\brasi\Desktop\server\public\refugos.html'

def fix_content(content):
    # Fix titles
    content = re.sub(r'GestÃƒÂƒÃ‚Â£o', 'Gestão', content)
    content = re.sub(r'FundiÃƒÂƒÃ‚Â§ÃƒÂƒÃ‚Â£o', 'Fundição', content)
    content = re.sub(r'ProduÃƒÂ§ÃƒÂ£o', 'Produção', content)
    content = re.sub(r'FUSÃƒÂƒO', 'FUSÃO', content)
    
    # Fix other common messes
    content = re.sub(r'Ã§Ã£o', 'ção', content)
    content = re.sub(r'Ã£o', 'ão', content)
    content = re.sub(r'Ã§', 'ç', content)
    content = re.sub(r'ProduÃ§Ã£o', 'Produção', content)
    content = re.sub(r'FUSÃƒO', 'FUSÃO', content)
    content = re.sub(r'Produǜo', 'Produção', content)
    content = re.sub(r'FUSǟO', 'FUSÃO', content)
    
    # Aggressive title fix
    content = re.sub(r'<title>.*Gestão.*Refugo.*Fundição.*Erus.*</title>', '<title>Gestão de Refugo - Fundição Erus</title>', content)
    # Aggressive KPI fix
    content = re.sub(r'<div class="kpi-title">Produ.*o Total \(FUS.*O\)</div>', '<div class="kpi-title">Produção Total (FUSÃO)</div>', content)
    # Aggressive product table fix
    content = re.sub(r'<th style="text-align: left;">Produ.*o</th>', '<th style="text-align: left;">Produto</th>', content)
    
    return content

if os.path.exists(path):
    # Read as Latin-1 first to capture all weirdnesses
    with open(path, 'r', encoding='latin-1') as f:
        content = f.read()
    
    # Apply multiple rounds of fix and re-fix
    fixed = fix_content(content)
    # One more round for nested messes
    fixed = fix_content(fixed)
    
    # Save as clean UTF-8
    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed)
    print("Restauração de codificação concluída.")
else:
    print("Arquivo não encontrado.")
