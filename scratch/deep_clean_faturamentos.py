import os

path = r'c:\Users\brasi\Desktop\server\public\faturamentos.html'

if os.path.exists(path):
    with open(path, 'rb') as f:
        content = f.read()
    
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('latin-1')

    # Fix more common double/triple encoding patterns
    replacements = {
        'MÃ‰DIA': 'MÉDIA',
        'PERÃ ODO': 'PERÍODO',
        'EVOLUÃ‡ÃƒO': 'EVOLUÇÃO',
        'EVOLU??O': 'EVOLUÇÃO',
        'NECESSÃ\x81RIO': 'NECESSÁRIO',
        'DIÃ\x81RIO': 'DIÁRIO',
        'Ã§Ã£o': 'ção',
        'Ã£o': 'ão',
        'Ã©': 'é',
        'Ã­': 'í',
        'Ã³': 'ó',
        'Ãº': 'ú',
        'Ã§': 'ç',
        'Ã¡': 'á',
        'Ã': 'Á',
        'VocÃª': 'Você',
        'necessÃ¡rio': 'necessário',
        'permissÃ£o': 'permissão'
    }
    
    fixed_text = text
    for old, new in replacements.items():
        if old in fixed_text:
            print(f"Substituindo '{old}' por '{new}'")
            fixed_text = fixed_text.replace(old, new)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed_text)
    print("Limpeza faturamentos.html concluída.")
else:
    print("Arquivo não encontrado.")
