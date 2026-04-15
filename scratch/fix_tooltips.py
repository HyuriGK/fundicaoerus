import os
import re

files_to_fix = [
    'public/apontamentos_produtivos.html',
    'public/pedidos.html',
    'public/faturamentos.html',
    'public/refugos.html',
    'public/devolucoes.html',
]

pattern_after_body = re.compile(r"afterBody:\s*\(\)\s*=>\s*\[\s*'',\s*'.*Clique esquerdo para ver os registros'\s*\]")
# For apontamentos_produtivos, we also want to remove the footer
pattern_footer = re.compile(r",\s*footer:\s*function\s*\(tooltipItems\)\s*\{\s*return\s*'\\nClique na barra para ver os registros\.';\s*\}", re.DOTALL)

for file_path in files_to_fix:
    full_path = os.path.join('c:/Users/brasi/Desktop/server', file_path)
    if not os.path.exists(full_path):
        print(f"File not found: {full_path}")
        continue
    
    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    new_content = content
    # Common change for afterBody
    new_content = pattern_after_body.sub("afterBody: () => ['', 'Clique na barra para ver os registros.']", new_content)
    
    # Specific fix for apontamentos_produtivos (remove footer)
    if 'apontamentos_produtivos.html' in file_path:
        new_content = pattern_footer.sub("", new_content)

    if new_content != content:
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Fixed: {file_path}")
    else:
        print(f"No changes made to: {file_path}")
