import os

path = r'c:\Users\brasi\Desktop\server\public\index.html'

if os.path.exists(path):
    with open(path, 'rb') as f:
        content = f.read()
    
    # Try to decode as UTF-8, if it fails, it's definitely messed up
    # However, it might be "valid" UTF-8 but with the wrong characters encoded.
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('latin-1')

    # Fix common triple/double encoding patterns
    replacements = {
        'MÃªs': 'Mês',
        'mÃªs': 'mês',
        'AderÃªncia': 'Aderência',
        'â€”': '—',
        'Ã‡ÃƒO': 'ÇÃO',
        'Ã§Ã£o': 'ção',
        'Ã£o': 'ão',
        'Ã©': 'é',
        'Ã­': 'í',
        'Ã³': 'ó',
        'Ãº': 'ú',
        'Ã§': 'ç',
        'Ã¡': 'á',
        'Ã': 'Á', # This one is tricky, usually part of others
        'ÃƒÂ§ÃƒÂ£o': 'ção',
        'ÃƒÂª': 'ê',
        'MÃƒÂªs': 'Mês',
        'mÃƒÂªs': 'mês'
    }
    
    fixed_text = text
    for old, new in replacements.items():
        if old in fixed_text:
            print(f"Substituindo '{old}' por '{new}'")
            fixed_text = fixed_text.replace(old, new)

    # Specific fix for the user's screenshot
    fixed_text = fixed_text.replace('FATURAMENTO (MÃªS)', 'FATURAMENTO (MÊS)')
    fixed_text = fixed_text.replace('vs mÃªs anterior', 'vs mês anterior')
    fixed_text = fixed_text.replace('META DE PESO (MES)', 'META DE PESO (MÊS)')
    fixed_text = fixed_text.replace('META DE PESO (MES)', 'META DE PESO (MÊS)') # Case variations
    fixed_text = fixed_text.replace('Faturamento (MES)', 'Faturamento (MÊS)')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed_text)
    print("Limpeza index.html concluída.")
else:
    print("Arquivo não encontrado.")
