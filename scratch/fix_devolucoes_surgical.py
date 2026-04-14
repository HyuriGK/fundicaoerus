import os
import re

path = r'c:\Users\brasi\Desktop\server\public\devolucoes.html'

if os.path.exists(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    for i in range(len(lines)):
        # Title/Subtitle cleanup
        if 'side-menu-title' in lines[i]:
            lines[i] = re.sub(r'>Op.*es<', '>Opções<', lines[i])
        if 'side-menu-subtitle' in lines[i]:
            lines[i] = re.sub(r'>DEVOLU.*ES<', '>DEVOLUÇÕES<', lines[i])
        
        # Toast cleanup (which I fixed before but might have broken again)
        if 'Voc' in lines[i] and 'permiss' in lines[i]:
             lines[i] = '                    "Você não tem permissão comercial",\n'
        if 'Se necess' in lines[i] and 'contato' in lines[i]:
             lines[i] = '                    "Se necessário, entre em contato com o administrador do sistema",\n'

    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Correção cirúrgica devolucoes.html concluída.")
