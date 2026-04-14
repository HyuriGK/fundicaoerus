import subprocess
import os

def force_restore_from_commit(file_relative_path, commit_hash):
    print(f"Restoring {file_relative_path} from commit {commit_hash}...")
    try:
        # Get content as bytes
        content = subprocess.check_output(['git', 'show', f'{commit_hash}:{file_relative_path}'], stderr=subprocess.STDOUT)
        
        # Write exactly those bytes to the file
        abs_path = os.path.join(os.getcwd(), file_relative_path)
        with open(abs_path, 'wb') as f:
            f.write(content)
        
        print(f"Successfully restored {file_relative_path}")
    except Exception as e:
        print(f"Error restoring {file_relative_path}: {e}")

# Restore the two critical files from the last known good commit
commit_good = 'b0d929d'
force_restore_from_commit('public/faturamentos.html', commit_good)
force_restore_from_commit('public/refugos.html', commit_good)
