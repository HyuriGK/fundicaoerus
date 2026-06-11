# 🔄 Sincronização de Dados - Firebird → Neon

Este documento explica como sincronizar dados do Firebird para o banco Neon (PostgreSQL).

## 🚀 Uso Rápido

### **Sincronizar TUDO (Recomendado)**
```bash
sync-all.bat
```
ou clique duas vezes no arquivo `sync-all.bat`

---

## 📋 O que o script faz?

O `sync-all.bat` executa automaticamente:

### **1. Setup Inicial** (primeira execução)
- ✅ Cria tabela `faturamento_clientes_ocultos`
- ✅ Adiciona coluna `cliente_nome` (se não existir)

### **2. Sincronização de Pedidos**
- ✅ Conecta no Firebird (10.1.1.100)
- ✅ Busca pedidos de **2025 e 2026**
- ✅ Filtra apenas pedidos **não faturados** e **não cancelados**
- ✅ Salva na tabela `firebird_sync_pedidos` no Neon
- ✅ Usado pela página `/pedidos.html`

### **3. Sincronização de Faturamento**
- ✅ Conecta no Firebird (10.1.1.100)
- ✅ Busca notas fiscais de **2026**
- ✅ Inclui nome do cliente (RAZAO_SOCIAL_NOT)
- ✅ Salva na tabela `faturamento_firebird` no Neon
- ✅ Usado pela página `/faturamento.html`

---

## 📊 Tabelas Criadas no Neon

| Tabela | Descrição | Usado por |
|--------|-----------|-----------|
| `firebird_sync_pedidos` | Pedidos 2025-2026 não faturados | `pedidos.html` |
| `faturamento_firebird` | Notas fiscais 2026 | `faturamento.html` |
| `faturamento_clientes_ocultos` | Clientes filtrados | Sistema de filtros |

---

## 🔧 Scripts Individuais

Se preferir rodar separadamente:

### **Apenas Pedidos:**
```bash
node scripts/sync-data.js
```

### **Apenas Faturamento:**
```bash
node scripts/sync/sync-firebird-to-postgres.js
```

### **Criar tabela de filtros:**
```bash
node scripts/create-filtros-table.js
```

### **Adicionar coluna cliente_nome:**
```bash
node scripts/add-cliente-nome-column.js
```

---

## ⏰ Quando Executar?

- **Primeira vez**: Para popular o banco Neon
- **Diariamente**: Para manter dados atualizados
- **Após mudanças**: Quando houver novos pedidos ou notas fiscais

---

## 🤖 Automatizar (Opcional)

### **Windows Task Scheduler:**

1. Abra o **Agendador de Tarefas** do Windows
2. Crie uma nova tarefa básica
3. Configure para executar diariamente (ex: 7h da manhã)
4. Ação: Iniciar programa
5. Programa: `C:\Users\brasi\Desktop\server\sync-all.bat`

---

## ⚠️ Requisitos

- ✅ Node.js instalado
- ✅ Arquivo `.env.local` configurado com `DATABASE_URL`
- ✅ Acesso ao Firebird (10.1.1.100:3050)
- ✅ Conexão com internet (para Neon)

---

## 🐛 Solução de Problemas

### **Erro de conexão Firebird:**
- Verifique se o servidor 10.1.1.100 está acessível
- Confirme usuário/senha: SYSDBA/masterkey

### **Erro de conexão Neon:**
- Verifique a variável `DATABASE_URL` no `.env.local`
- Confirme conexão com internet

### **Erro "tabela não existe":**
- Execute `sync-all.bat` que cria as tabelas automaticamente

---

## 📞 Suporte

Em caso de dúvidas, verifique os logs no terminal após executar o script.
