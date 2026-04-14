import os
import re

def final_clean(path):
    if not os.path.exists(path): return
    with open(path, 'rb') as f:
        data = f.read()
    
    # Fix the Ícones pattern exactly
    # 20 65 20 c3 83 c2 8d 63 6f 6e 65 73 -> " e Ícones"
    data = data.replace(b'\xc3\x83\xc2\x8d', b'\xc3\x8d')
    data = data.replace(b'\xc3\x83\xc2\x83\xc2\x8d', b'\xc3\x8d') # Triple case
    
    # SELEÇÃO
    data = data.replace(b'SELE\xc3\x87\xc3\x83O', b'SELE\xc3\x87\xc3\x83O') # Just in case
    
    # Refugos Sectors cleanup
    data = data.replace(b"'USINAGEM EXPEDI\xc3\x87\xc3\x83O'", b"'USINAGEM', 'MODELO'")
    # Search for USINAGEM followed by EXPEDIÇÃO incorrectly merged
    data = data.replace(b'USINAGEM EXPEDI\xc3\x87\xc3\x83O', b'USINAGEM')
    
    with open(path, 'wb') as f:
        f.write(data)
    print(f"Final cleaned {path}")

files = [
    r'c:\Users\brasi\Desktop\server\public\refugos.html',
    r'c:\Users\brasi\Desktop\server\public\acabamento_externo.html'
]

for f in files:
    final_clean(f)
