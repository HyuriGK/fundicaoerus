import os
import re

def fix_refugos_special(path):
    if not os.path.exists(path): return
    with open(path, 'rb') as f:
        data = f.read()

    # 1. KPI Gap
    data = data.replace(b'gap: 30px;', b'gap: 150px;')
    
    # 2. Modal Headers
    data = re.sub(b'Respons[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}vel', b'Respons\xc3\xa1vel', data)
    data = re.sub(b'setor [\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,} respons', b'setor \xc3\xa9 respons', data)
    
    # 3. Setores Array
    data = re.sub(b'FUS[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}O', b'FUS\xc3\x83O', data)
    data = re.sub(b'T[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}RMICO', b'T\xc3\x89RMICO', data)
    data = re.sub(b'MODELA[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}O', b'MODELA\xc3\x87\xc3\x83O', data)
    data = re.sub(b'EXPEDI[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}O', b'EXPEDI\xc3\x87\xc3\x83O', data)
    
    # 4. Outros
    data = re.sub(b'N[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}o Definido', b'N\xc3\xa3o Definido', data)

    with open(path, 'wb') as f:
        f.write(data)
    print(f"Special fixed {path}")

def fix_acabamento_clean(path):
    if not os.path.exists(path): return
    with open(path, 'rb') as f:
        data = f.read()
    
    # Fix residual patterns like "Ã cones"
    # Using hex for Ã (C3 83)
    data = re.sub(b'\xc3\x83[\x80-\xff]* cones', b'\xc3\x8dcones', data)
    
    # SELEÇÃO
    data = re.sub(b'SELE[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}O', b'SELE\xc3\x87\xc3\x83O', data)

    with open(path, 'wb') as f:
        f.write(data)
    print(f"Cleaned {path}")

fix_refugos_special(r'c:\Users\brasi\Desktop\server\public\refugos.html')
fix_acabamento_clean(r'c:\Users\brasi\Desktop\server\public\acabamento_externo.html')
