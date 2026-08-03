# Enterprise hardening

What we shipped for security, tenancy, and Meta-scale reliability — and what to configure next.

## Security & tenancy

| Control | Status |
|---------|--------|
| Drop leftover `mvp_st_*` RLS (incl. `notifications`) | Migration `039` |
| `access_grants` + platform admin Approve/Revoke | Live |
| Invite-by-email (`platform_invites` → auto-approve) | Admin → Invite |
| Domain allowlist `AUTH_ALLOWED_DOMAINS` | Optional env |
| Audit log (`audit_logs`) for login, grants, Connect/token | Live |
| Open-demo `/api/mvp/*` blocked when `VERCEL_ENV=production` | Middleware |
| Tokens never logged (structured logger redacts) | `src/lib/observability/logger.ts` |

### Session timeout

Set JWT expiry in **Supabase → Authentication → Sessions** (e.g. 1–8 hours). App-level max age is intentionally not faked in middleware (Supabase refresh tokens own that).

### Recommended env (production)

```bash
AUTH_PROVIDER=google
NEXT_PUBLIC_AUTH_PROVIDER=google
SINGLE_TENANT_MODE=false
PLATFORM_ADMIN_EMAILS=vsmarttechindia@gmail.com
NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS=vsmarttechindia@gmail.com
# Optional:
# AUTH_ALLOWED_DOMAINS=vsmarttec.com
# SENTRY_DSN=https://…@….ingest.sentry.io/…
```

## Reliability & Meta

| Control | Status |
|---------|--------|
| Webhook HMAC verify (fail-closed) | Existing |
| Idempotency `webhook_events` (message/status/template) | Migration `039` |
| Account-scoped status updates | Webhook handler |
| Durable `job_queue` + cron drain + dead-letter | Keepalive drains |
| Meta 429 retry with backoff on send | `send-message.ts` |
| Per-user + per-account send rate limits | `/api/whatsapp/send` |
| Structured logs + optional Sentry (`SENTRY_DSN`) | Observability helpers |

### Hobby keep-warm vs Pro

- **Hobby:** GitHub `keep-warm.yml` every 10m is required for wait-steps.
- **Pro / Fluid:** Prefer Vercel Cron at a finer schedule + `job_queue` drain; you can disable the GitHub workflow once Pro cron covers you.

## Ops checklist

1. Confirm `039_enterprise_hardening` applied (no `mvp_st%` policies left).
2. Set `SENTRY_DSN` for error capture.
3. Rotate Meta system-user tokens on a calendar; Connect save writes `whatsapp.token_rotate` audit rows.
4. Review `audit_logs` (admin+ of an account) after incidents.
5. Load-test webhook bursts before onboarding large WA volumes.

## Best-in-class wedge (migration 047+)

See [SAAS.md](./SAAS.md) and [public-api.md](./public-api.md):

- Contact opt-out (`STOP`) + campaign exclusion
- Idempotent `POST /api/v1/messages`
- Outbound signed webhooks for delivery status
- `time_based` automation scheduler on keepalive
- Flows runner + `/flows` starter UI
- Quiet hours / frequency caps on campaigns
