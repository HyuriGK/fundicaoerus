import os
import re

path = r'c:\Users\brasi\Desktop\server\public\faturamentos.html'

if os.path.exists(path):
    with open(path, 'rb') as f:
        content = f.read()
    
    # Try to decode to work with regex, and ignore errors
    text = content.decode('utf-8', errors='ignore')

    # Structural repairs using regex
    # KPI 1
    text = re.sub(r'<div class="kpi-title">NECESS.*?RIO DI.*?RIO</div>', 
                  '<div class="kpi-title">NECESSÁRIO DIÁRIO</div>', text)
    
    # KPI 2
    text = re.sub(r'<div class="kpi-subtext">M.*?DIA DO PER.*?ODO</div>', 
                  '<div class="kpi-subtext">MÁDIA DO PERÍODO</div>', text) # Note: Fixed word here
    text = text.replace('MÁDIA', 'MÉDIA') # Double check
    
    # Button
    text = re.sub(r'EVOLU.*?O TEMPORAL', 'EVOLUÇÃO TEMPORAL', text)
    
    # Side menu/Titles
    text = re.sub(r'<title>Faturamentos - Fundi.*?o Erus</title>', 
                  '<title>Faturamentos - Fundição Erus</title>', text)
    text = re.sub(r'<div class="side-menu-title">Op.*?es</div>', 
                  '<div class="side-menu-title">Opções</div>', text)
    text = re.sub(r'<div class="chart-title">Evolu.*?o Anual', 
                  '<div class="chart-title">Evolução Anual', text)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Reparo estrutural faturamentos.html concluído.")
else:
    print("Arquivo não encontrado.")
