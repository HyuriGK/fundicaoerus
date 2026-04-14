import os
import re

path = r'c:\Users\brasi\Desktop\server\public\index.html'

if os.path.exists(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    fixed = content
    # Generic fixes for common messes seen in index.html
    fixed = fixed.replace('DevoluÃ§Ãµes', 'Devoluções')
    fixed = fixed.replace('Devolues', 'Devoluções')
    fixed = fixed.replace('Monitoramento de OP\'s', 'Monitoramento de OPs')
    
    # Specific surgical fixes
    fixed = fixed.replace('<span>Devoluções</span>', '<span>Devoluções</span>') # ensuring it's correct
    
    # Final check for any broken characters
    fixed = re.sub(r'Devolu.*es', 'Devoluções', fixed)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed)
    print("Cleanup index.html concluído.")
else:
    print("Arquivo não encontrado.")
