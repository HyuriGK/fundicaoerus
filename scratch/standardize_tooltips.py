import os

files_to_standardize = [
    'public/acabamento_externo.html',
    'public/devolucoes.html',
    'public/custos.html',
    'public/faturamentos.html',
    'public/pedidos.html',
    'public/reuniao.html',
    'public/refugos.html',
    'public/index.html',
    'public/clientes.html',
    'public/carteira.html',
    'public/apontamentos_produtivos.html',
    'public/aderencia.html',
]

for file_path in files_to_standardize:
    full_path = os.path.join('c:/Users/brasi/Desktop/server', file_path)
    if not os.path.exists(full_path):
        continue
    
    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    new_content = content
    # Replace the redundant mouse icon text
    new_content = new_content.replace('🖱 Clique esquerdo para ver os registros', 'Clique na barra para ver os registros.')
    # Update card titles for consistency
    new_content = new_content.replace('Clique esquerdo para ver os registros', 'Clique para ver os registros')
    
    if new_content != content:
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Standardized: {file_path}")
