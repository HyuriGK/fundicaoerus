# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the server locally
node api/index.js
# or with auto-reload
npx nodemon api/index.js

# Run a sync script (example)
node scripts/sync-data.js
node scripts/sync-faturamento-to-neon.js

# Sync all data (bat file, Windows)
sincronizar_dados.bat
```

Environment variables are loaded from `.env.local` (not `.env`). Required vars: `DATABASE_URL`, `FIREBIRD_HOST`, `FIREBIRD_USER`, `FIREBIRD_PASSWORD`.

## Architecture

This is a Node.js/Express backend for **Fundição Erus** — an industrial order and production management system ("Gestão de Carteira de Pedidos").

### Data Flow

The system has two databases:

- **Firebird** (local, `10.1.1.100:3050`): Source of truth — ERP data (orders, billing, production, costs). Read-only from the API's perspective. Uses `lib/firebird-helper.js` as the centralized connection utility (includes monkey-patched retry logic on `Firebird.attach`).
- **Neon (PostgreSQL)**: Cloud database used for synced/processed data, user management, preferences, and custom data. Uses `lib/db.js` (pg Pool).

Most modules read from Firebird for real-time queries or from Neon for pre-synced data. Sync scripts in `scripts/` periodically pull Firebird data into Neon tables (e.g., `firebird_sync_pedidos`, `faturamento_firebird`).

### Structure

- `api/index.js` — Express app entry point. Mounts all route modules and handles CORS, logging, and error handling.
- `src/` — One file per business domain, each exporting an Express Router. Examples: `carteira.js`, `faturamento.js`, `pedidos-firebird.js`, `auth.js`, `ai-assistant.js`.
- `lib/db.js` — PostgreSQL pool (Neon). Always import this for Postgres queries.
- `lib/firebird-helper.js` — Firebird connection with retry logic. Always use `attach` or `Firebird`/`options` exports from here; never configure Firebird manually.
- `scripts/` — Standalone Node.js scripts for data sync and schema migrations. Not part of the web server.
- `public/` — Static frontend HTML/JS/CSS files served separately (not by this Express app in production — deployed to Vercel).

### Route Naming Pattern

| API prefix | Source |
|---|---|
| `/api/faturamento-firebird` | Live query to Firebird |
| `/api/faturamento-postgres` / `/api/faturamento-neon` | Pre-synced Neon data |
| `/api/pedidos-firebird` | Live Firebird |
| `/api/pedidos-sync` | Synced Neon table |
| `/api/refugo` | Legacy |
| `/api/refugos-new` | Firebird-synced |

### Auth

JWT-based (`jsonwebtoken`). `src/auth.js` handles login/token. Protected routes validate the token in middleware. Admin routes are under `/api/admin/`.

### AI

`src/ai-assistant.js` integrates Google Gemini (`@google/generative-ai`) and OpenAI. Config in `src/gemini_config.js` and `src/deepseek_config.js`.

### Deployment

Deployed on **Vercel** (see `vercel.json`). The Express app is exported as a module (`module.exports = app`) and also boots a local server when run directly.

## TOKEN OPTIMIZATION RULES (STRICT)

- **Respostas curtas** — apenas código, sem prosa.

- **Sem agentes** — nunca chame runSubagent ou outros agentes.

- **Sem MCP tools** — não use ferramentas de servidor MCP.

- **Sem contexto automático** — não releia arquivos já lidos antes.

- **Sem thinking mode** — a menos que explicitamente solicitado.

- **Sem summarização** — desabilitar compressão/auto-context.

- **Sem docs自动** — nunca crie .md, summaries ou logs automaticamente.

- **Sonnet por padrão** — use Opus apenas se eu pedir.
