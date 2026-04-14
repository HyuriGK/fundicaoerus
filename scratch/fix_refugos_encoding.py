import os

path = r'c:\Users\brasi\Desktop\server\public\refugos.html'

# Dictionary of multiple-broken patterns
replacements = {
    'GestÃƒÂ£o': 'Gestão',
    'FundiÃƒÂ§ÃƒÂ£o': 'Fundição',
    'ProduÃƒÂ§ÃƒÂ£o': 'Produção',
    'FUSÃƒÂƒO': 'FUSÃO',
    'Produǜo': 'Produção',
    'FUSǟO': 'FUSÃO',
    'ProduÃ§Ã£o': 'Produção',
    'FUSÃƒO': 'FUSÃO',
    'GestÃ£o': 'Gestão',
    'FundiÃ§Ã£o': 'Fundição',
    # And the ones that might have been partially fixed
    'ProduÃ§Ã£o': 'Produção',
    'FUSÃƒO': 'FUSÃO',
}

if os.path.exists(path):
    # Read as Latin-1 to see everything as it is
    with open(path, 'r', encoding='latin-1') as f:
        content = f.read()

    new_content = content
    for old, new in replacements.items():
        if old in new_content:
            print(f"Substituindo '{old}' por '{new}'")
            new_content = new_content.replace(old, new)

    # Final check for Produção in case it was simplified
    # (Note: sometimes it becomes Produo or similar)

    # Save as UTF-8
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Correção nível 3 concluída.")
else:
    print("Arquivo não encontrado.")
