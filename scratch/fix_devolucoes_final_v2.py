import os
import re

path = r'c:\Users\brasi\Desktop\server\public\devolucoes.html'

if os.path.exists(path):
    with open(path, 'rb') as f:
        content = f.read()
    
    # Common double-messed UTF-8 patterns
    content = content.replace(b'\xc3\x83\xc2\xa3', 'ã'.encode('utf-8')) # Ã£ -> ã
    content = content.replace(b'\xc3\x83\xc2\xa7', 'ç'.encode('utf-8')) # Ã§ -> ç
    content = content.replace(b'\xc3\x83\xc2\xb5', 'õ'.encode('utf-8')) # Ãµ -> õ
    content = content.replace(b'\xc3\x83\xc2\x87\xc3\x83\xc2\x95', 'ÇÕES'.encode('utf-8')) # Ã‡Ã• -> ÇÕ
    
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('latin-1')

    # Surgical replacement for specific known garbled strings in devolucoes
    text = text.replace('OpçÃµes', 'Opções')
    text = text.replace('DEVOLUÃ‡Ã•ES', 'DEVOLUÇÕES')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Limpeza definitiva devolucoes.html concluída.")
else:
    print("Arquivo não encontrado.")
