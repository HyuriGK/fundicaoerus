"""
Upgrade Google Fonts link in all sub-pages to include the Outfit display font.
"""
import re

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

# The new full fonts URL with Outfit
NEW_FONTS_URL = (
    "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700"
    "&amp;family=JetBrains+Mono:wght@400;700"
    "&amp;family=Outfit:wght@300;400;500;600;700;800&amp;display=swap"
)

# Pattern to match existing partial fonts link (any variation)
FONT_PATTERN = re.compile(
    r'href="https://fonts\.googleapis\.com/css2\?[^"]*"',
    re.IGNORECASE
)

OUTFIT_MARKER = 'Outfit'

for path in pages:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        if OUTFIT_MARKER in content:
            print(f'SKIP (already has Outfit): {path}')
            continue

        new_content = FONT_PATTERN.sub(f'href="{NEW_FONTS_URL}"', content, count=1)

        if new_content == content:
            print(f'WARNING: font link not found in {path}')
            continue

        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(new_content)

        print(f'OK (Outfit added): {path}')

    except Exception as e:
        print(f'ERROR in {path}: {e}')

print('\nDone.')
