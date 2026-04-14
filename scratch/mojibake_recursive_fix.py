import os

def fix_mojibake_recursive(text):
    # This is a heuristic fix for multiple layers of UTF-8 -> CP1252 encoding
    current = text
    for _ in range(10): # Max 10 levels
        try:
            # Someone took UTF-8 bytes and interpreted them as CP1252 (Windows-1252)
            # To fix it, we encode back as CP1252 and decode as UTF-8
            next_text = current.encode('cp1252').decode('utf-8')
            if next_text == current:
                break
            current = next_text
        except (UnicodeEncodeError, UnicodeDecodeError):
            # If CP1252 fails, try Latin-1
            try:
                next_text = current.encode('latin-1').decode('utf-8')
                if next_text == current:
                    break
                current = next_text
            except (UnicodeEncodeError, UnicodeDecodeError):
                break
    return current

files = [
    r'c:\Users\brasi\Desktop\server\public\refugos.html',
    r'c:\Users\brasi\Desktop\server\public\acabamento_externo.html',
    r'c:\Users\brasi\Desktop\server\public\pedidos.html',
    r'c:\Users\brasi\Desktop\server\public\faturamentos.html'
]

for fpath in files:
    if not os.path.exists(fpath): continue
    
    with open(fpath, 'rb') as f:
        content = f.read().decode('utf-8', errors='ignore')
    
    # We apply the fix to each string/label, but here we can try the whole file
    # though sometimes it's better to do it line by line if there's mixed encoding.
    new_content = fix_mojibake_recursive(content)
    
    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Recursively fixed {fpath}")
