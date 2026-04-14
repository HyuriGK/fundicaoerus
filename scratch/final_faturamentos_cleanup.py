import os
import re

path = r'c:\Users\brasi\Desktop\server\public\faturamentos.html'

if os.path.exists(path):
    with open(path, 'rb') as f:
        content = f.read()
    
    # Generic double/triple mess cleaning
    # UTF-8: MÉDIA is M (4D) É (C3 89) D (44) I (49) A (41)
    # If C3 89 is interpreted as Latin-1, it's Ã‰.
    # If Ã‰ is UTF-8 encoded, it's C3 83 C2 89.
    
    # Let's just fix the strings we see in the view_file output
    content = content.replace('MÁ‰DIA'.encode('utf-8'), 'MÉDIA'.encode('utf-8'))
    content = content.replace('PERÁ ODO'.encode('utf-8'), 'PERÍODO'.encode('utf-8'))
    content = content.replace('EVOLUÁ‡ÁƒO'.encode('utf-8'), 'EVOLUÇÃO'.encode('utf-8'))
    content = content.replace('NECESSÁRIO'.encode('utf-8'), 'NECESSÁRIO'.encode('utf-8'))
    content = content.replace('DIÁRIO'.encode('utf-8'), 'DIÁRIO'.encode('utf-8'))
    content = content.replace('DescriÁ§Á£o'.encode('utf-8'), 'Descrição'.encode('utf-8'))
    content = content.replace('SeleÁ§Á£o'.encode('utf-8'), 'Seleção'.encode('utf-8'))
    content = content.replace('EvoluÁ§Á£o'.encode('utf-8'), 'Evolução'.encode('utf-8'))
    
    # Other common ones
    content = content.replace('Ã‰'.encode('utf-8'), 'É'.encode('utf-8'))
    content = content.replace('Ã\x8d'.encode('utf-8'), 'Í'.encode('utf-8'))
    content = content.replace('Ã‡ÃƒO'.encode('utf-8'), 'ÇÃO'.encode('utf-8'))
    content = content.replace('Ã§Ã£o'.encode('utf-8'), 'ção'.encode('utf-8'))

    with open(path, 'wb') as f:
        f.write(content)
    print("Limpeza faturamentos.html concluída (binário).")
else:
    print("Arquivo não encontrado.")
