import os
import re

files = [
    r'public/index.html',
    r'public/pedidos.html',
    r'public/faturamentos.html',
    r'public/devolucoes.html',
    r'public/refugos.html',
    r'public/acabamento_externo.html'
]

def recover_file(rel_path):
    base_path = r'c:\Users\brasi\Desktop\server'
    path = os.path.join(base_path, rel_path)
    if not os.path.exists(path): return

    # Read the file
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # If the file line count is much higher than expected, it's likely corrupted
    # Or just check for double newlines
    if '\n\n' in content:
        print(f"Recovering {rel_path}...")
        # Replace multiple newlines with a single one, 
        # but maybe keep double ones if they were intentional?
        # In this specific corruption, it seems every line got an extra \n
        
        # A safer way to revert this specific corruption (usually \r\r\n mess)
        lines = content.splitlines()
        clean_lines = [line for line in lines if line.strip() != '']
        
        # Wait, if I just remove ALL empty lines, I might break formatting.
        # Let's try to just collapse multiple newlines.
        
        recovered = re.sub(r'\n\s*\n', '\n', content)
        
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
             f.write(recovered)
        print(f"File {rel_path} recovered.")

for f in files:
    recover_file(f)
