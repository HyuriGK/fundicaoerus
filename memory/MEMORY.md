# Memory Index

## Procedimentos de Produção
- [Procedimento 130 - Etapas Produtivas](project_procedure_130.md) — Roteiro validado: Moldagem Pesada→Fusão→Acabamento→TT→Qualidade→Expedição
- [Procedimento 131 - Etapas Produtivas](project_procedure_131.md) — Roteiro confirmado via print ERP: Moldagem Leve→Fusão→Acabamento→TT→Qualidade→Expedição
- [Procedimento 132 - Etapas Produtivas](project_procedure_132.md) — "Item Bruto c/ Moldagem Manual": Moldagem Manual→Fusão→Acabamento→TT→Qualidade→Expedição
- [Procedimento 133 - LAMINADO FEITO EM TERCEIRO](project_procedure_133.md) — Usinagem Expedição→Qualidade→Expedição (sem moldagem/fusão interna)
- [Procedimento 134 - ITEM EM ESTOQUE](project_procedure_134.md) — Apenas Expedição (item já em estoque)
- [Procedimento 135 - FABRICAÇÃO DE MODELO NOVO](project_procedure_135.md) — Modelaria→Expedição
- [Procedimento 136 - REPARO DE MODELO](project_procedure_136.md) — Modelaria→Expedição Reforma de Modelos
- [Procedimento 137 - ITEM USINADO C/ MOLDAGEM LEVE](project_procedure_137.md) — Moldagem Leve→Fusão→Acabamento→TT→Usinagem Expedição→Qualidade→Expedição
- [Procedimento 138 - ITEM USINAGEM C/ MOLDAGEM MANUAL](project_procedure_138.md) — Moldagem Manual→Fusão→Acabamento→TT→Usinagem Expedição→Qualidade→Expedição
- [Procedimento 139 - ITEM USINADO C/ MOLDAGEM PESADA](project_procedure_139.md) — Moldagem Pesada→Fusão→Acabamento→TT→Usinagem Expedição→Qualidade→Expedição

## Rules

- Sistema é hospedado no Vercel — todas as alterações exigem deploy para entrar em vigor. [ses_134f2298cffe]
- Sync scripts usam truncate+reinsert no Neon (não incrementação), é mais demorado mas assertivo. [ses_134f22ccbffe]
- Usuários desenvolvedores podem alterar quem registrou parada; outros roles não devem remover registros alheios (deve aparecer mensagem de negação). [ses_134f2298cffe]
- Usuário role "visitante" só visualiza; roles "moldagem", "fusão", "acabamento" têm sidebar restrita com whitelist hardcoded em `public/js/sidebar.js` (`restrictedPageMap`). [ses_134f22f2bffe, ses_134f22f8dffe]
- Role SGQ criado com permissões iniciais iguais ao role visitante (a ser ajustado no painel admin). [ses_134f22ccbffe]
- SGP ERUS significa "Sistema de Gerenciamento de Processos" (não "Sistema de Gestão de Pedidos"). [ses_134f22da7ffe]

## Architecture decisions

- Modal design: a maioria dos modais deve ocupar quase toda a tela (não modais pequenos). Padrão consolidado em pedidos, apontamentos_produtivos, rh, acabamento_externo. [ses_134f2298cffe, ses_134f22ccbffe]
- PDF de fichas técnicas: 1 ficha por página, capa em paisagem. Script de PDF é sensível a configurações de impressão (bug de 2 folhas já identificado). [ses_134f22da7ffe, ses_134f22c8cffe]
- `chao.html` (PWA "Chão de Fábrica") foi removido por decisão do usuário. [ses_134f230e2ffe]

## Discovered durable knowledge

- Firebird DB provider alterou autenticação de SHA-1 para SHA-256, quebrando sync. `node-firebird` só suporta SRP (SHA-1). Workaround: provider fez rollback ou habilitou legacy_auth. [ses_134f22f2bffe]
- Sidebar `restrictedPageMap` em `public/js/sidebar.js` controla visibilidade por role — precisa ser atualizado sempre que novas telas ou roles são adicionados. [ses_134f22f2bffe, ses_134f22f8dffe]
- Sync scripts: `sincronizar_dados.bat`, `sync-forever.bat`. Atualização de emissões é a etapa mais lenta e propensa a erros de timeout. [ses_134f22f2bffe]
- Tela RH (`rh.html`) adicionada em Jun/2026: cadastro de funcionários (nome, CPF, admissão, cargo, setor, vínculo, avaliações 45/90 dias, advertências). [ses_134f22ccbffe]
- activity-logger já existe no sistema para rastreabilidade de auditoria. [ses_134f2298cffe]
- Formatação de colunas em pedidos.html: código=largura mínima, cliente reduzido, espaço redistribuído entre entrega/peso_un/peso_total/total_RS. [ses_134f2298cffe]
