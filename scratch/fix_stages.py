import io
import os

path = r'c:\Users\brasi\Desktop\server\public\pedidos.html'
if not os.path.exists(path):
    print(f"File not found: {path}")
    exit(1)

with io.open(path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    # sectorGroups or sectorMapping regions
    if (4610 <= i <= 4620) or (4790 <= i <= 4800):
        indent = "            " if (4610 <= i <= 4620) else "                "
        
        if "'ACABAMENTO':" in line:
            lines[i] = f"{indent}'TRATAMENTO TÉRMICO (TT)': ['ACABAMENTO', 'REBARBAÇÃO', 'REBARBACAO', 'GRALHA', 'SUBSTITUICAO', 'RETRABALHO DE ACABAMENTO'],\n"
        elif "'TRATAMENTO TÉRMICO':" in line:
            lines[i] = f"{indent}'USINAGEM': ['TRATAMENTO TÉRMICO', 'TRATAMENTO TERMICO', 'NORMALIZACAO', 'NORMALIZAÇÃO', 'TEMPERA', 'TÊMPERA', 'REVENIMENTO', 'SOLUBILIZAÇAO', 'SOLUBILIZAÇÃO', 'PARTICULA MAGNETICA DEPOIS TEMPERA', 'RETORNO TEMPERA EXTERNA'],\n"
        elif "'USINAGEM EXPEDIÇÃO':" in line:
            lines[i] = f"{indent}'QUALIDADE': ['USINAGEM', 'USINAGEM EXPEDICAO', 'TORNEARIA', 'RETORNO USINAGEM', 'SERVICO DE USINAGEM', 'SERVIÇO DE USINAGEM'],\n"
        elif "'INSPEÇÃO DE QUALIDADE':" in line:
            lines[i] = f"{indent}'EXPEDIÇÃO': ['INSPEÇÃO DE QUALIDADE', 'INSPECAO DE QUALIDADE', 'QUALIDADE', 'REVISÃO', 'PRODUZIDA / INSPECIONADO'],\n"
        elif "'EXPEDIÇÃO': ['EXPEDIÇÃO', 'EXPEDICAO'" in line:
            lines[i] = f"{indent}'FATURAMENTO': ['EXPEDIÇÃO', 'EXPEDICAO', 'LOGÍSTICA'],\n"
        elif "'FATURAMENTO': ['FATURAMENTO', 'FATURADO', 'NF'" in line:
            suffix = ",\n" if i < 4619 or (4790 <= i < 4798) else "\n"
            lines[i] = f"{indent}'SAÍDA/FATURADO': ['FATURAMENTO', 'FATURADO', 'NF', 'SAÍDA']{suffix}"

with io.open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print("Updated successfully")
