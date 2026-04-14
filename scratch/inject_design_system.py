import re

# Pages to update (monitoramento.html excluded)
pages = [
    'public/refugos.html',
    'public/faturamentos.html',
    'public/acabamento_externo.html',
    'public/acabamento_interno.html',
    'public/pedidos.html',
    'public/aderencia.html',
    'public/custos.html',
    'public/carteira.html',
    'public/devolucoes.html',
    'public/reuniao.html',
    'public/apontamentos_produtivos.html',
    'public/fichatecmoldagem.html',
]

LINK_TAG = '    <link rel="stylesheet" href="css/dashboard-design-system.css">\n'
MARKER = 'dashboard-design-system.css'

for path in pages:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Skip if already injected
        if MARKER in content:
            print(f'SKIP (already has DS): {path}')
            continue
        
        # Inject after <script src="js/loader.js"></script>
        pattern = r'(<script src="js/loader\.js"></script>)'
        replacement = r'\1\n' + LINK_TAG.rstrip('\n')
        new_content = re.sub(pattern, replacement, content, count=1)
        
        if new_content == content:
            print(f'WARNING: could not inject in {path}')
            continue
        
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(new_content)
        
        print(f'OK: {path}')
    
    except Exception as e:
        print(f'ERROR in {path}: {e}')

print('\nDone.')
