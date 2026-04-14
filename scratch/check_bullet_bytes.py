import os

def find_bullet_bytes(path):
    if not os.path.exists(path): return
    with open(path, 'rb') as f:
        data = f.read()
    
    # Search for statsPanel and then kpi-value
    idx = data.find(b'statsPanel')
    if idx != -1:
        # Get next 1000 bytes
        chunk = data[idx:idx+2000]
        # Find where the bullets are (they come after formatCurrency)
        b_idx = chunk.find(b": '")
        if b_idx != -1:
            end_idx = chunk.find(b"'}", b_idx)
            if end_idx != -1:
                bullet_data = chunk[b_idx+3:end_idx]
                print(f"Bytes of bullets in {path}: {bullet_data.hex(' ')}")

find_bullet_bytes(r'c:\Users\brasi\Desktop\server\public\acabamento_externo.html')
