import os

files = [
    r'public/index.html',
    r'public/pedidos.html',
    r'public/faturamentos.html',
    r'public/devolucoes.html',
    r'public/refugos.html',
    r'public/acabamento_externo.html'
]

# Patterns to find and replace (from most specific to least specific)
replacements = [
    ('OpÃƒÂ§ÃƒÂµes', 'Opções'),
    ('DEVOLUÃƒâ€¡Ãƒâ€¢ES', 'DEVOLUÇÕES'),
    ('FundiÃƒÂ§ÃƒÂ£o', 'Fundição'),
    ('GestÃƒÂ£o', 'Gestão'),
    ('ProduÃ§Ã£o', 'Produção'),
    ('FUSÃƒO', 'FUSÃO'),
    ('Produǜo', 'Produção'),
    ('FUSǟO', 'FUSÃO'),
    ('AÃ§Ãµes', 'Ações'),
    ('Ã§Ã£o', 'ção'),
    ('Ã£o', 'ão'),
    ('Ã§', 'ç'),
    ('Ã¡', 'á'),
    ('Ã©', 'é'),
    ('Ã­', 'í'),
    ('Ã³', 'ó'),
    ('Ãº', 'ú'),
    ('Ã£', 'ã'),
    ('VocÃª', 'Você'),
    ('necessÃ¡rio', 'necessário'),
    ('permissÃ£o', 'permissão'),
    ('SessÃ£o', 'Sessão'),
    ('RelatÃ³rio', 'Relatório'),
    ('ConfiguraÃ§Ãµes', 'Configurações'),
]

def fix_file(rel_path):
    # Try multiple base paths if needed
    base_path = r'c:\Users\brasi\Desktop\server'
    path = os.path.join(base_path, rel_path)
    
    if not os.path.exists(path):
        print(f"Arquivo não encontrado: {path}")
        return

    # Read as Latin-1 to treat bytes as characters
    with open(path, 'r', encoding='latin-1') as f:
        content = f.read()

    new_content = content
    for old, new in replacements:
        if old in new_content:
            # print(f"Fixing {rel_path}: '{old}' -> '{new}'")
            new_content = new_content.replace(old, new)

    # Save as UTF-8
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Arquivo {rel_path} processado.")

for f in files:
    fix_file(f)
