import os
import re

path = r'c:\Users\brasi\Desktop\server\public\refugos.html'

if os.path.exists(path):
    # Read as UTF-8, ignore any broken characters
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    # Line 8 is the title tag
    if len(lines) >= 8:
        # Check if it looks like the title line
        if '<title>' in lines[7]:
            lines[7] = '    <title>Gestão de Refugo - Fundição Erus</title>\n'
            print("Título corrigido na linha 8.")
    
    # Also check line 834 for Produção
    if len(lines) >= 834:
        if '<div class="kpi-title">' in lines[833]:
            lines[833] = '                    <div class="kpi-title">Produção Total (FUSÃO)</div>\n'
            print("KPI corrigido na linha 834.")

    # Generic search and replace for other common areas that might be broken
    # But only if they were recently messed up
    for i in range(len(lines)):
        # Correct 'Sucesso', 'Negado', etc. if they became garbled
        if 'Sucesso' in lines[i] or 'Negado' in lines[i]:
            # They seem fine in recent views, but let's be safe
            pass
            
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Correção cirúrgica concluída.")
else:
    print("Arquivo não encontrado.")
