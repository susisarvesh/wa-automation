# Contributing

This repo is **WhatsApp Studio** (`susisarvesh/wa-automation`) — a
single-tenant WhatsApp automation MVP.

## Local setup

```bash
git clone https://github.com/susisarvesh/wa-automation.git
cd wa-automation
cp .env.local.example .env.local
npm install
npm run dev
```

Apply SQL under `supabase/migrations/` to your Supabase project before
using Connect / Inbox / Automations.

## Pull requests

- Keep changes focused on the MVP surface (home, connect, automations,
  inbox, customers, settings).
- Run `npm run typecheck` and `npm test` before opening a PR.
- Prefer small PRs with a clear why in the description.

## Security

Report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/susisarvesh/wa-automation/security/advisories/new)
instead of a public issue.
