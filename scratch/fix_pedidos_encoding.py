import os

# Define the file path
file_path = r'c:\Users\brasi\Desktop\server\public\pedidos.html'

# Common mojibake patterns found in the file
replacements = {
    'POSIÃ‡ÃƒO': 'POSIÇÃO',
    'POSI\u019f\ufffd\u019f\ufffdO': 'POSIÇÃO', # Case from powershell output
    'GRÃ FICOS': 'GRÁFICOS',
    'EMISSÃƒO': 'EMISSÃO',
    'emissÃµes': 'emissões',
    'CÃ“DIGO': 'CÓDIGO',
    'CÃ“D.': 'CÓD.',
    'Ãšnicos': 'Únicos',
    'MÃªs': 'Mês',
    'InformaçÃµes': 'Informações',
    'HISTÃ“RICO': 'HISTÓRICO',
    'Ãšltima': 'Última',
    'Ãšltimo': 'Último',
    'transferÃªncia': 'transferência',
    'Ã coes': 'Ícones',
    'SELEÃ‡ÃƒO': 'SELEÇÃO',
    'BOTÃ•ES': 'BOTÕES',
    'BotÃµes': 'Botões',
    'CENTRALIZA\u00c3\u2021\u00c3\u2030O': 'CENTRALIZAÇÃO',
    'CABE\u00c3\u2021ALHOS': 'CABEÇALHOS',
    'Ã°Å¸â€œâ€¦': '📅',
    'ROTEIRO DINÃ‚MICO': 'ROTEIRO DINÂMICO',
    'INSPEÃ‡ÃƒO': 'INSPEÇÃO',
    'FUSÃƒO': 'FUSÃO',
    'REBARBAÃ‡ÃƒO': 'REBARBAÇÃO',
    'TÃ‰RMICO': 'TRATAMENTO TÉRMICO',
    'NORMALIZAÃ‡ÃƒO': 'NORMALIZAÇÃO',
    'TÃŠMPERA': 'TÊMPERA',
    'SOLUBILIZAÃ‡ÃƒO': 'SOLUBILIZAÇÃO',
    'EXPEDIÃ‡ÃƒO': 'EXPEDIÇÃO',
    'LOGÃ STICA': 'LOGÍSTICA',
    'SAÃ DA': 'SAÍDA'
}

# Add the role check logic fix here just in case, or do it via replace_file_content since it worked partially.
# Actually, the role check SHOULD have worked in the previous multi_replace call if it matched.
# Let's check if the role check worked.

with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

for old, new in replacements.items():
    content = content.replace(old, new)

# Also fix the specific lines that might have weird chars like in powershell output
import re
content = re.sub(r'POSI.\ufffd.\ufffdO', 'POSIÇÃO', content)
content = re.sub(r'GR. FICOS', 'GRÁFICOS', content)
content = re.sub(r'EMISS. O', 'EMISSÃO', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement complete.")
