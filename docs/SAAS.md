# SaaS packaging checklist

After dogfood (Vsmart CRM + Studio) is reliable on `https://wa.vsmarttec.net`:

## Product surface

- [x] Custom domain (`wa.vsmarttec.net`)
- [x] Public API + API keys + outbound webhooks
- [x] Campaigns with opt-out / quiet hours / frequency
- [x] Automations + time-based scheduler
- [x] Conversational Flows (starter builder)
- [ ] Billing / plan limits (sends, seats) — when selling
- [ ] Self-serve Connect wizard polish for new tenants
- [ ] Vsmart template starter pack auto-seed on Connect

## Ops

1. Apply migration `047_best_in_class_wedge.sql` on Supabase.
2. Set production `NEXT_PUBLIC_SITE_URL=https://wa.vsmarttec.net`.
3. Meta webhook: `https://wa.vsmarttec.net/api/whatsapp/webhook`.
4. Set `SENTRY_DSN` (see ENTERPRISE.md).
5. CRM Lightsail: `WA_STUDIO_BASE_URL=https://wa.vsmarttec.net` + API key + approved template names.
6. Studio Settings → Webhooks → CRM receiver URL for status updates.

## Positioning

Sell **CRM-grade WhatsApp** (ticket notify + automations + compliant campaigns), not “another inbox.”
