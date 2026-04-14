import os
import re

path = r'c:\Users\brasi\Desktop\server\public\index.html'

if os.path.exists(path):
    with open(path, 'rb') as f:
        content = f.read()
    
    # Try multiple decodings to handle the mess
    # The image shows MÃªs, which is UTF-8 (C3 AA) interpreted as Latin-1 (Ãª) then re-encoded
    # Actually, MÃªs is usually UTF-8 interpreted as Latin-1.
    
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('latin-1')

    # Specific replacements for the reported issues
    text = text.replace('MÃªs', 'Mês')
    text = text.replace('mÃªs', 'mês')
    text = text.replace('AderÃªncia', 'Aderência')
    text = text.replace('META DE PESO (MES)', 'META DE PESO (MÊS)')
    text = text.replace('Faturamento (MES)', 'Faturamento (MÊS)')
    
    # Aggressive regex for labels
    text = re.sub(r'\(M\w+s\)', '(MÊS)', text)
    text = re.sub(r'vs m\w+s anterior', 'vs mês anterior', text)
    
    # Cleanup for the side menu Aderência
    text = re.sub(r'>Ader.*ncia<', '>Aderência<', text)
    
    # Generic fixes for the C3 83 mess again just in case
    text = text.replace('Ãª', 'ê')
    text = text.replace('Ã§Ã£o', 'ção')
    text = text.replace('Ã£o', 'ão')
    text = text.replace('Ã§', 'ç')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Correções de Mês e Aderência concluídas no index.html.")
else:
    print("Arquivo não encontrado.")
