# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for security bugs.**

Report privately via
[GitHub Security Advisories](https://github.com/susisarvesh/wa-automation/security/advisories/new).

Include, if you can:

- A description of the issue and the impact
- Reproduction steps or a proof-of-concept
- The commit or release you're testing against

## Scope

In scope: this repository (`susisarvesh/wa-automation`) — webhook and
auth flows, token encryption, RLS policies, and cron endpoints.

Out of scope: third-party services (Supabase, Meta), and deployments
that disable single-tenant safeguards without adding real auth.
