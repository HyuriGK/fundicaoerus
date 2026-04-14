import os

file_path = r'c:\Users\brasi\Desktop\server\public\pedidos.html'

def fix_encoding():
    with open(file_path, 'rb') as f:
        content = f.read()
    
    # Try to clean up double/triple encoding by repeatedly decoding and encoding
    # or just targeted byte replacements.
    
    # Target common mojibake in UTF-8 displayed as Latin-1 and then re-encoded
    replacements = [
        (b'GR\xc3\x83\xc6\x92\xc3\x82\xc2\xa0 FICOS', b'GR\xc3\x81 FICOS'), # GRÁFICOS
        (b'EMISS\xc3\x83\xc6\x92\xc3\x82\xc2\x83O', b'EMISS\xc3\x83O'),     # EMISSÃO
        (b'POSI\xc3\x83\xe2\u20ac\u02dc\xc3\x83\u0192O', b'POSI\xc3\x87\xc3\x83O'), # POSIÇÃO
        (b'C\xc3\x83\xe2\u20ac\u0153DIGO', b'C\xc3\x93DIGO'),                # CÓDIGO
    ]
    
    # Since byte-matching is hard without knowing exactly what's there, 
    # let's try to decode as UTF-8, then if we see the 'Ãƒ' patterns, fix them.
    try:
        text = content.decode('utf-8')
    except:
        text = content.decode('latin-1')
    
    # Fix corrupted strings
    # These are specific strings I saw in tool outputs
    text = text.replace('GRÃƒÂ FICOS', 'GRÁFICOS')
    text = text.replace('EMISSÃƒÂƒO', 'EMISSÃO')
    text = text.replace('CÃ“DIGO', 'CÓDIGO')
    text = text.replace('CÃ“D. PROD', 'CÓD. PROD')
    text = text.replace('Ãšnicos', 'Únicos')
    text = text.replace('MÃªs', 'Mês')
    text = text.replace('InformaçÃµes', 'Informações')
    text = text.replace('emissÃµes', 'emissões')
    text = text.replace('transferÃªncia', 'transferência')
    text = text.replace('Ã coes', 'Ícones')
    text = text.replace('SELEÃ‡ÃƒO', 'SELEÇÃO')
    text = text.replace('BOTÃ•ES', 'BOTÕES')
    text = text.replace('CENTRALIZAÃ‡ÃƒO', 'CENTRALIZAÇÃO')
    
    # Clean up double-encoded characters that might have been introduced by powershell
    text = text.replace('ÃƒÂ ', 'Á')
    text = text.replace('ÃƒÂƒ', 'Ã')
    text = text.replace('ÃƒÂ§', 'ç')
    text = text.replace('ÃƒÂµ', 'õ')
    text = text.replace('ÃƒÂ³', 'ó')
    text = text.replace('ÃƒÂª', 'ê')
    text = text.replace('ÃƒÂ‰', 'É')
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Cleaned encoding.")

fix_encoding()
