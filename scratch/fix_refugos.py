import os

path = r'c:\Users\brasi\Desktop\server\public\refugos.html'
with open(path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Fix the specific line
target = "if (role !== 'desenvolvedor' && role !== 'diretor' && role !== 'administrador') {"
replacement = "if (role !== 'desenvolvedor' && role !== 'diretor' && role !== 'administrador' && role !== 'gerente comercial') {"

if target in content:
    content = content.replace(target, replacement)
    print("Sucesso: permissão atualizada.")
else:
    print("Aviso: alvo não encontrado.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
