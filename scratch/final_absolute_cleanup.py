import os

files = [
    r'public/index.html',
    r'public/pedidos.html',
    r'public/faturamentos.html',
    r'public/devolucoes.html',
    r'public/refugos.html',
    r'public/acabamento_externo.html'
]

# Specific surgical fixes
def fix_all():
    base_path = r'c:\Users\brasi\Desktop\server'
    
    for rel_path in files:
        path = os.path.join(base_path, rel_path)
        if not os.path.exists(path): continue
        
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # Clean up any leftover garble in title/header
        fixed = content
        fixed = fixed.replace('OpçõesES', 'Opções')
        fixed = fixed.replace('DEVOLUÇÕESES', 'DEVOLUÇÕES')
        fixed = fixed.replace('OpçÃµes', 'Opções') # if it reverted
        
        # Generic title/header cleaning
        import re
        fixed = re.sub(r'>Op.*es<', '>Opções<', fixed)
        fixed = re.sub(r'DEVOLU.*ES', 'DEVOLUÇÕES', fixed)
        fixed = re.sub(r'Produ.*o Total \(FUS.*O\)', 'Produção Total (FUSÃO)', fixed)
        fixed = re.sub(r'Gest.*o de Refugo', 'Gestão de Refugo', fixed)
        fixed = re.sub(r'Fundi.*o Erus', 'Fundição Erus', fixed)

        # Restore common correctly encoded ones that might be partially broken
        fixed = fixed.replace('ProduÃ§Ã£o', 'Produção')
        fixed = fixed.replace('FUSÃƒO', 'FUSÃO')
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(fixed)
        print(f"Final cleanup done for {rel_path}")

fix_all()
