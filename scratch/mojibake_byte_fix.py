import re
import os

def byte_fix(path):
    if not os.path.exists(path): return
    with open(path, 'rb') as f:
        data = f.read()
    
    # 1. Dia/Mês
    data = re.sub(b'M[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}s', b'M\xc3\xaas', data)
    
    # 2. Evolução Diária
    data = re.sub(b'Evolu[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}o Di[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}ria', b'Evolu\xc3\xa7\xc3\xa3o Di\xc3\xa1ria', data)
    
    # 3. Gráfico
    data = re.sub(b'Gr[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}fico', b'Gr\xc3\xa1fico', data)

    # 4. Código Peça
    data = re.sub(b'C[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}d\. Pe[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}a', b'C\xc3\xb3d. Pe\xc3\xa7a', data)
    
    # 5. Responsável
    data = re.sub(b'Respons[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}vel', b'Respons\xc3\xa1vel', data)
    
    # 6. Atenção
    data = re.sub(b'Aten[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}o', b'Aten\xc3\xa7\xc3\xa3o', data)
    
    # 7. Válido
    data = re.sub(b'v[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}lido', b'v\xc3\xa1lido', data)

    # 8. Ícones
    data = re.sub(b'\xc3\x83\xc2\x81 cones', b'\xc3\x8dcones', data)
    data = re.sub(b'\xc3\x83[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]* cones', b'\xc3\x8dcones', data)

    # 9. Seleção
    data = re.sub(b'SELE[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}O', b'SELE\xc3\x87\xc3\x83O', data)
    
    # 10. Área de transferência
    data = re.sub(b'[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}rea de transfer[\x80-\xff\xc2-\xc6\x92\xa1-\xaf]{2,}ncia', b'\xc3\x81rea de transfer\xc3\xaancia', data)

    with open(path, 'wb') as f:
        f.write(data)
    print(f"Byte-fixed {path}")

files = [
    r'c:\Users\brasi\Desktop\server\public\refugos.html',
    r'c:\Users\brasi\Desktop\server\public\acabamento_externo.html',
    r'c:\Users\brasi\Desktop\server\public\pedidos.html',
    r'c:\Users\brasi\Desktop\server\public\faturamentos.html'
]

for f in files:
    byte_fix(f)
