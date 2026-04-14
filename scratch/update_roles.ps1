$files = @("public/devolucoes.html", "public/refugos.html")

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        
        # Devolucoes
        if ($file -like "*devolucoes.html") {
            $content = $content -replace "'comercial', 'diretor'", "'comercial', 'diretor', 'gerente comercial'"
        }
        
        # Refugos
        if ($file -like "*refugos.html") {
            $content = $content -replace "'diretor' \|\| role === 'administrador'", "'diretor' || role === 'administrador' || role === 'gerente comercial'"
            $content = $content -replace "'diretor' \|\| currentUserRole === 'administrador'", "'diretor' || currentUserRole === 'administrador' || currentUserRole === 'gerente comercial'"
            $content = $content -replace "diretores e administradores podem editar pesos", "diretores, gerente comercial e administradores podem editar pesos"
        }
        
        [IO.File]::WriteAllText((Get-Item $file).FullName, $content)
    }
}
