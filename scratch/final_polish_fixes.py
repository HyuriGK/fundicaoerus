import os

def fix_bullets(path):
    if not os.path.exists(path): return
    with open(path, 'rb') as f:
        data = f.read()
    
    # "â€¢â€¢â€¢â€¢â€¢â€¢" -> "••••••"
    # â€¢ in UTF-8 represented as CP1252 bytes interpreted as UTF-8 again...
    # The bytes for â€¢ in the file (from Turn 17 view_file) are â€¢ (E2 80 A2)
    # But if it shows as â€¢ in a UTF-8 viewer, it means the bytes are actually C3 A2 E2\x80\x9A\xc2\xac\xc2\xa2? No.
    
    # I'll just use a direct replace on the string provided by the user/view_file
    # â€¢ is E2 80 A2 (Bullet)
    # â € ¢ (corrupted)
    
    # Let's find exactly what's in the file. 
    # From Turn 17: 'â€¢â€¢â€¢â€¢â€¢â€¢'
    
    # Actually I'll just search for 'â€¢' and replace with '•'
    # But I'll use a more surgical approach.
    
    # Targets for acabamento_externo.html
    data = data.replace(b'\xc3\xa2\xe2\x82\xac\xc2\xa2', b'\xe2\x80\xa2') # â€¢ to •
    
    with open(path, 'wb') as f:
        f.write(data)
    print(f"Fixed bullets in {path}")

def fix_refugos_setores(path):
    if not os.path.exists(path): return
    with open(path, 'rb') as f:
        data = f.read()
    
    # Split USINAGEM EXPEDIÇÃO
    # Original: 'TRATAMENTO TÉRMICO', 'USINAGEM EXPEDIÇÃO', 'MODELAÇÃO', 'EXPEDIÇÃO'
    # Target: 'TRATAMENTO TÉRMICO', 'USINAGEM', 'MODELO', 'EXPEDIÇÃO' (Wait, MODELO or MODELAÇÃO?)
    
    # Let's keep it simple: split USINAGEM and EXPEDIÇÃO
    data = data.replace(b"'USINAGEM EXPEDI\xc3\x87\xc3\x83O'", b"'USINAGEM', 'MODELA\xc3\x87\xc3\x83O', 'EXPEDI\xc3\x87\xc3\x83O'")
    
    # Remove duplicates if any
    data = data.replace(b"'MODELA\xc3\x87\xc3\x83O', 'MODELA\xc3\x87\xc3\x83O'", b"'MODELA\xc3\x87\xc3\x83O'")
    
    with open(path, 'wb') as f:
        f.write(data)
    print(f"Fixed sectors in {path}")

fix_bullets(r'c:\Users\brasi\Desktop\server\public\acabamento_externo.html')
fix_refugos_setores(r'c:\Users\brasi\Desktop\server\public\refugos.html')
