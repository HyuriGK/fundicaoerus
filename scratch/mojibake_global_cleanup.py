import os
import re

files_to_fix = [
    r'c:\Users\brasi\Desktop\server\public\pedidos.html',
    r'c:\Users\brasi\Desktop\server\public\refugos.html',
    r'c:\Users\brasi\Desktop\server\public\acabamento_externo.html',
    r'c:\Users\brasi\Desktop\server\public\faturamentos.html'
]

mojibake_map = {
    # Extreme triple/quadruple encoding
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚ÂƒÃƒÂƒÃ‚Â‚ÃƒÂ‚Ã‚Â¡': 'á',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚ÂƒÃƒÂƒÃ‚Â‚ÃƒÂ‚Ã‚Â§ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚ÂƒÃƒÂƒÃ‚Â‚ÃƒÂ‚Ã‚Â£o': 'ção',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚ÂƒÃƒÂƒÃ‚Â‚ÃƒÂ‚Ã‚Â³': 'ó',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚ÂƒÃƒÂƒÃ‚Â‚ÃƒÂ‚Ã‚Âª': 'ê',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚ÂƒÃƒÂƒÃ‚Â‚ÃƒÂ‚Ã‚Â§': 'ç',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚ÂƒÃƒÂƒÃ‚Â‚ÃƒÂ‚Ã‚Âµ': 'õ',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚ÂƒÃƒÂƒÃ‚Â‚ÃƒÂ‚Ã‚Â©': 'é',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚ÂƒÃƒÂƒÃ‚Â‚ÃƒÂ‚Ã‚Â­': 'í',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚ÂƒÃƒÂƒÃ‚Â‚ÃƒÂ‚Ã‚Â ': ' ', # Non-breaking space usually
    
    # Double/Triple encoding
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚Â£o': 'ão',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚Â¡': 'á',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚Â³': 'ó',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚Â§': 'ç',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚Â­': 'í',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚Âª': 'ê',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚Âµ': 'õ',
    'ÃƒÂƒÃ‚ÂƒÃƒÂ‚Ã‚Â©': 'é',
    
    # Simple Mojibake (UTF-8 as Latin-1)
    'ÃƒÂ¡': 'á',
    'ÃƒÂ£o': 'ão',
    'ÃƒÂ³': 'ó',
    'ÃƒÂ§': 'ç',
    'ÃƒÂ­': 'í',
    'ÃƒÂª': 'ê',
    'ÃƒÂµ': 'õ',
    'ÃƒÂ©': 'é',
    'ÃƒÂ‰': 'É',
    'ÃƒÂ‡': 'Ç',
    'ÃƒÂ ': 'à',
    'Ã‚Â': '',
    
    # More specific ones seen in files
    'Ã‡Ãƒ': 'ÇÃO',
    'Ã‡': 'Ç',
    'Ãƒ': 'Ã',
    'Ã“': 'Ó',
    'Ãš': 'Ú',
    'Ãª': 'ê',
    'Ãµ': 'õ',
    'Ã¡': 'á',
    'Ã­': 'í',
    'Ã³': 'ó',
    'Ã¹': 'ú',
    'Ã¢': 'â',
    'Ã´': 'ô',
    'Ã ': 'à',
    'Ã©': 'é',
}

def fix_file(path):
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return
    
    with open(path, 'rb') as f:
        content = f.read().decode('utf-8', errors='ignore')

    # Apply fixes from longest pattern to shortest
    sorted_patterns = sorted(mojibake_map.keys(), key=len, reverse=True)
    for pattern in sorted_patterns:
        content = content.replace(pattern, mojibake_map[pattern])

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Fixed {path}")

if __name__ == "__main__":
    for f in files_to_fix:
        fix_file(f)
