import os
import re

path = r'c:\Users\brasi\Desktop\server\public\refugos.html'

if os.path.exists(path):
    with open(path, 'rb') as f:
        content = f.read()
    
    # Common double-messed UTF-8 patterns for typical Portuguese characters
    # This addresses the C3 83... mess
    replacements = [
        (b'Produ\xc3\x83\xc2\xa7\xc3\x83\xc2\xa3o', 'Produção'.encode('utf-8')),
        (b'FUS\xc3\x83\xc6\x92\xc3\x83\xc2\x92\xc3\x83\xc2\x83\xc3\x83\xc2\x82', 'FUSÃO'.encode('utf-8')), # Approximate mess
        (b'Op\xc3\x83\xc2\xa7\xc3\x83\xc2\xb5es', 'Opções'.encode('utf-8')),
        (b'Gest\xc3\x83\xc2\xa3o', 'Gestão'.encode('utf-8')),
        (b'Fundi\xc3\x83\xc2\xa7\xc3\x83\xc2\xa3o', 'Fundição'.encode('utf-8')),
    ]
    
    # Generic fix for the most common Portuguese broken chars
    # Ã£ -> ã
    content = content.replace(b'\xc3\x83\xc2\xa3', 'ã'.encode('utf-8'))
    # Ã§ -> ç
    content = content.replace(b'\xc3\x83\xc2\xa7', 'ç'.encode('utf-8'))
    # Ãµ -> õ
    content = content.replace(b'\xc3\x83\xc2\xb5', 'õ'.encode('utf-8'))
    # Ã¡ -> á
    content = content.replace(b'\xc3\x83\xc2\xa1', 'á'.encode('utf-8'))
    # Ã© -> é
    content = content.replace(b'\xc3\x83\xc2\xa9', 'é'.encode('utf-8'))
    # Ã­ -> í
    content = content.replace(b'\xc3\x83\xc2\xad', 'í'.encode('utf-8'))
    # Ã³ -> ó
    content = content.replace(b'\xc3\x83\xc2\xb3', 'ó'.encode('utf-8'))
    # Ãº -> ú
    content = content.replace(b'\xc3\x83\xc2\xba', 'ú'.encode('utf-8'))
    # ÃŠ -> Ê
    content = content.replace(b'\xc3\x83\xc2\x8a', 'Ê'.encode('utf-8'))
    # Ã  -> à
    content = content.replace(b'\xc3\x83\xc2\xa0', 'à'.encode('utf-8'))
    
    # Special fix for FUSÃO (which had a really weird C6 92 in it)
    # Let's just find and replace the whole line if possible
    
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('latin-1')

    # Surgical line fixes for the most important KPIs and Titles
    text = re.sub(r'<title>.*Gest.*o.*Refugo.*Fundi.*o.*Erus.*</title>', '<title>Gestão de Refugo - Fundição Erus</title>', text)
    text = re.sub(r'<div class="kpi-title">Produ.*o Total \(FUS.*O\)</div>', '<div class="kpi-title">Produção Total (FUSÃO)</div>', text)
    text = re.sub(r'Produ.*o Total \(FUS.*O\)', 'Produção Total (FUSÃO)', text)
    text = re.sub(r'Op.*es', 'Opções', text)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Limpeza definitiva concluída.")
else:
    print("Arquivo não encontrado.")
