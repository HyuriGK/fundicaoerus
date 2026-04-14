import os

def find_mojibake_bytes(path, search_str):
    if not os.path.exists(path): return
    with open(path, 'rb') as f:
        data = f.read()
    
    # Try to find where "cones" is
    idx = data.find(b'cones')
    if idx != -1:
        # Get 10 bytes before
        start = max(0, idx - 10)
        chunk = data[start:idx+5]
        print(f"Bytes around 'cones' in {path}: {chunk.hex(' ')}")

find_mojibake_bytes(r'c:\Users\brasi\Desktop\server\public\acabamento_externo.html', 'cones')
find_mojibake_bytes(r'c:\Users\brasi\Desktop\server\public\refugos.html', 'cones')
