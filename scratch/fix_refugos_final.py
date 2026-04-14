import os

path = r'c:\Users\brasi\Desktop\server\public\refugos.html'

if os.path.exists(path):
    # Read as UTF-8 (since it's mostly valid UTF-8 now)
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Fix the double-encoded FUSÃO and others
    content = content.replace('FUSÃƒO', 'FUSÃO')
    content = content.replace('ÃƒÂ§ÃƒÂ£o', 'ção')
    content = content.replace('ÃƒÂ£o', 'ão')
    content = content.replace('ÃƒÂ§', 'ç')
    
    # Fix the recently observed titles
    content = content.replace('GestÃƒÂ£o', 'Gestão')
    content = content.replace('FundiÃƒÂ§ÃƒÂ£o', 'Fundição')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fix final refugos.html concluído.")
else:
    print("Arquivo não encontrado.")
