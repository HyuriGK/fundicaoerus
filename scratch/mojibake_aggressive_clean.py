import re

def aggressive_clean(text):
    # This regex targets the "tree-like" mojibake structures
    # It looks for Ã followed by ANY combination of Ã, Â, ƒ, ‚, Â¡, Â§, etc. 
    # and ends with a character that was originally the accented one.
    
    replacements = [
        (r'Ã[ƒÂ‚Ã‚Â]*ª', 'ê'),
        (r'Ã[ƒÂ‚Ã‚Â]*§Ã[ƒÂ‚Ã‚Â]*£o', 'ção'),
        (r'Ã[ƒÂ‚Ã‚Â]*£o', 'ão'),
        (r'Ã[ƒÂ‚Ã‚Â]*¡', 'á'),
        (r'Ã[ƒÂ‚Ã‚Â]*³', 'ó'),
        (r'Ã[ƒÂ‚Ã‚Â]*§', 'ç'),
        (r'Ã[ƒÂ‚Ã‚Â]*µ', 'õ'),
        (r'Ã[ƒÂ‚Ã‚Â]*©', 'é'),
        (r'Ã[ƒÂ‚Ã‚Â]*­', 'í'),
        (r'Ã[ƒÂ‚Ã‚Â]*§Ã[ƒÂ‚Ã‚Â]*£', 'çã'),
        (r'Ã[ƒÂ‚Ã‚Â]*º', 'º'),
        (r'Ã[ƒÂ‚Ã‚Â]* ', ' '),
    ]
    
    for pattern, rep in replacements:
        text = re.sub(pattern, rep, text)
    
    # Simple ones
    text = text.replace('Ã cones', 'Ícones')
    text = text.replace('SELEÃ‡ÃƒO', 'SELEÇÃO')
    text = text.replace('Ã‡', 'Ç')
    
    return text

files = [
    r'c:\Users\brasi\Desktop\server\public\refugos.html',
    r'c:\Users\brasi\Desktop\server\public\acabamento_externo.html',
    r'c:\Users\brasi\Desktop\server\public\pedidos.html'
]

for fpath in files:
    with open(fpath, 'rb') as f:
        content = f.read().decode('utf-8', errors='ignore')
    
    new_content = aggressive_clean(content)
    
    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Aggressively fixed {fpath}")
