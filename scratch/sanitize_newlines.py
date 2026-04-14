import os

def cleanup_line_endings(file_relative_path):
    print(f"Normalizing line endings in {file_relative_path}...")
    abs_path = os.path.join(os.getcwd(), file_relative_path)
    if not os.path.exists(abs_path):
        print(f"File not found: {abs_path}")
        return

    with open(abs_path, 'rb') as f:
        data = f.read()
    
    # Remove all Carriage Returns (\r = 0x0D)
    # This leaves just Line Feeds (\n = 0x0A)
    clean_data = data.replace(b'\r', b'')
    
    with open(abs_path, 'wb') as f:
        f.write(clean_data)
    
    print(f"Sanitized {file_relative_path}. New size: {len(clean_data)} bytes.")

# Cleanup the corrupted files
cleanup_line_endings('public/faturamentos.html')
cleanup_line_endings('public/refugos.html')
cleanup_line_endings('public/acabamento_externo.html') # Check this one too just in case
cleanup_line_endings('public/pedidos.html')
