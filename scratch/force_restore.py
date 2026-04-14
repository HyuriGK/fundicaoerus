import subprocess
import os

def force_restore_from_git(file_relative_path):
    print(f"Restoring {file_relative_path} from git HEAD...")
    try:
        # Get content from git HEAD as bytes
        content = subprocess.check_output(['git', 'show', f'HEAD:{file_relative_path}'], stderr=subprocess.STDOUT)
        
        # Write exactly those bytes to the file
        # We use binary mode to avoid any newline translation by Python
        abs_path = os.path.join(os.getcwd(), file_relative_path)
        with open(abs_path, 'wb') as f:
            f.write(content)
        
        print(f"Successfully restored {file_relative_path}")
    except Exception as e:
        print(f"Error restoring {file_relative_path}: {e}")

# Restore the two critical files
force_restore_from_git('public/faturamentos.html')
force_restore_from_git('public/refugos.html')
