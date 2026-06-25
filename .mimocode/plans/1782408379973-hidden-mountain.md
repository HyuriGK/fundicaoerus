# Plano: Botão "Gerar PDF" branco no modal de Relatório de Pontualidade

## Problema
O botão "Gerar PDF" no modal "Relatório de Pontualidade" está com cor amarela/dourada (`var(--color-primary)`). O usuário quer que seja branco.

## Arquivo alvo
`public/acabamento_externo.html` — linha 1362

```html
<button class="btn-modern btn-add" onclick="gerarRelatorioPontualidadePDF()">
  <i class="fa-solid fa-download"></i> Gerar PDF
</button>
```

A classe `.btn-add` (linha 452) define:
```css
.btn-add {
    background: var(--color-primary);
    color: #000;
}
```

## Solução
Adicionar `style="background:#fff; color:#000;"` inline no botão específico, sem alterar a classe global `.btn-add` (usada em outros botões do modal de carga, etc).

## Verificação
Abrir o modal de "Relatório de Pontualidade" e confirmar que o botão "Gerar PDF" aparece com fundo branco e texto preto.
