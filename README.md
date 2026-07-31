# Vsmart WhatsApp

Simple WhatsApp automation for [Vsmart Technologies](https://vsmarttec.com/).
Connect a Business number, pick a ready-made automation, and reply from one
inbox — single workspace, no login UI, no CRM clutter.

Brand UI follows Vsmart’s site palette (blue `#3659c9`, orange `#f97316`)
with **Syne** + **DM Sans**. Built on Next.js 16 and Supabase.

## What it includes

- **Connect** — save Cloud API credentials and verify your number
- **Automations** — template gallery (welcome, follow-ups, lead capture, etc.) with one-click publish
- **Inbox** — conversations, media, templates, interactive messages, notes
- **Customers** — contacts, tags, CSV import
- **Settings** — business profile, appearance, WhatsApp config

## What was removed

Team auth, pipelines, broadcasts, flow builder, AI agents, public REST API,
and MCP server. Schema leftovers may still exist in older migrations; the
app surface above is the product.

## Quick start

```bash
git clone https://github.com/susisarvesh/wa-automation.git
cd wa-automation
npm install
cp .env.local.example .env.local   # Supabase + Meta + ENCRYPTION_KEY
```

Apply Supabase migrations from `supabase/migrations/`, then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you land on `/home`
with no login (single-tenant mode).

Optional Docker setup: [docs/docker.md](./docs/docker.md).

## Environment

See [`.env.local.example`](./.env.local.example). Required:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side service role |
| `ENCRYPTION_KEY` | 64-hex AES key for WhatsApp tokens |
| `META_APP_SECRET` | Webhook signature verification |

Single-tenant flags (defaults are fine for local demo):

```bash
SINGLE_TENANT_MODE=true
SINGLE_TENANT_ACCOUNT_ID=a0000000-0000-4000-8000-000000000001
NEXT_PUBLIC_SINGLE_TENANT_ACCOUNT_ID=a0000000-0000-4000-8000-000000000001
```

Set `WHATSAPP_CONNECT_SKIP_VERIFY=true` only for local connect demos
without a live Meta app.

## Stack

- **App** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4
- **Data** — Supabase (Postgres + Auth + Storage + RLS)
- **WhatsApp** — Meta Cloud API

## Scripts

```bash
npm run dev        # local server
npm run build      # production build
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

## Security note

Single-tenant open access is **not production-safe**. Harden auth and
RLS before exposing a public deployment.

## License

[MIT](./LICENSE).
