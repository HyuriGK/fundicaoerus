import os
import re

path = r'c:\Users\brasi\Desktop\server\public\faturamentos.html'

if os.path.exists(path):
    with open(path, 'rb') as f:
        content = f.read()
    
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('latin-1')

    # Specific fixes for the reported issues
    text = text.replace('EVOLU??O', 'EVOLUÇÃO')
    text = text.replace('EVOLUÃ‡ÃƒO', 'EVOLUÇÃO')
    text = text.replace('NECESS?RIO', 'NECESSÁRIO')
    text = text.replace('NECESSÃ\x81RIO', 'NECESSÁRIO')
    text = text.replace('DI?RIO', 'DIÁRIO')
    text = text.replace('DIÃ\x81RIO', 'DIÁRIO')
    
    # Other common ones seen in faturamentos
    text = text.replace('M?DIA', 'MÉDIA')
    text = text.replace('PER?ODO', 'PERÍODO')
    text = text.replace('Descrio', 'Descrição')
    text = text.replace('DescriÃ§Ã£o', 'Descrição')
    text = text.replace('Botes de Ao', 'Botões de Ação')
    text = text.replace('Fundio', 'Fundição')
    text = text.replace('Seleo', 'Seleção')
    text = text.replace('Evoluo', 'Evolução')
    text = text.replace('EvoluÃ§Ã£o', 'Evolução')

    # Aggressive title fixes
    text = text.replace('NECESSÁRIO DIÁRIO', 'NECESSÁRIO DIÁRIO')
    text = text.replace('EVOLUÇÃO TEMPORAL', 'EVOLUÇÃO TEMPORAL')
    text = text.replace('EVOLUÇÃO MENSAL', 'EVOLUÇÃO MENSAL')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Correções de codificação concluídas no faturamentos.html.")
else:
    print("Arquivo não encontrado.")
