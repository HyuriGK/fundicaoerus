import os
import re

def fix_faturamentos_encoding(path):
    if not os.path.exists(path): return
    with open(path, 'rb') as f:
        data = f.read()

    # EVOLUÁ‡ÁƒO -> EVOLUÇÃO
    # Pattern seen: EVOLUÁ‡ÁƒO (EVOLU\xc3\x81\xe2\x80\xa1\xc3\x81\xc6\x92O)
    data = data.replace(b'EVOLU\xc3\x81\xe2\x80\xa1\xc3\x81\xc6\x92O', b'EVOLU\xc3\x87\xc3\x83O')
    
    # MARÁ‡O -> MARÇO
    # Pattern seen: MARÁ‡O (MAR\xc3\x81\xe2\x80\xa1O)
    data = data.replace(b'MAR\xc3\x81\xe2\x80\xa1O', b'MAR\xc3\x87O')

    with open(path, 'wb') as f:
        f.write(data)
    print(f"Fixed encoding in {path}")

def fix_refugos_setores_cleanup(path):
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()
    
    # Ensure correct sectors list
    # Remove 'MODELO' if it was accidentally added in a previous turn's fix
    text = text.replace("'USINAGEM', 'MODELO'", "'USINAGEM'")
    text = text.replace("'MODELO', 'MODELAÇÃO'", "'MODELAÇÃO'")
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"Cleaned sectors in {path}")

fix_faturamentos_encoding(r'c:\Users\brasi\Desktop\server\public\faturamentos.html')
fix_refugos_setores_cleanup(r'c:\Users\brasi\Desktop\server\public\refugos.html')
