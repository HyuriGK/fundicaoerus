import os

def final_polish(path):
    if not os.path.exists(path): return
    with open(path, 'rb') as f:
        data = f.read()
    
    # â€¢ is C3 A2 E2 82 AC C2 A2
    # â is C3 A2
    # € is E2 82 AC
    # ¢ is C2 A2
    target = b'\xc2\xac\xc2\x90' # Wait, let's just use the direct string from a small test
    
    # Better yet, I'll use the decoded string and replace.
    try:
        text = data.decode('utf-8', errors='ignore')
        # Replace the corrupted bullet cluster
        text = text.replace('â€¢', '•')
        text = text.replace('â‚¬', '€') # Just in case
        
        # Sectors fix for refugos.html
        if 'refugos.html' in path:
            text = text.replace("'USINAGEM EXPEDIÇÃO'", "'USINAGEM', 'MODELAÇÃO', 'EXPEDIÇÃO'")

        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f"Polished {path}")
    except Exception as e:
        print(f"Error {path}: {e}")

final_polish(r'c:\Users\brasi\Desktop\server\public\acabamento_externo.html')
final_polish(r'c:\Users\brasi\Desktop\server\public\refugos.html')
