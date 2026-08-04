# SaaS packaging checklist

After dogfood (Vsmart CRM + Studio) is reliable on `https://wa.vsmarttec.net`:

## Product surface

- [x] Custom domain (`wa.vsmarttec.net`)
- [x] Public API + API keys + outbound webhooks
- [x] Campaigns with opt-out / quiet hours / frequency
- [x] Campaign CSV audiences, custom-field merge, QR + URL click funnel
- [x] Automations + time-based scheduler
- [x] Conversational Flows (starter builder)
- [ ] Billing / plan limits (sends, seats) — when selling
- [ ] Self-serve Connect wizard polish for new tenants
- [x] Vsmart enterprise template pack in Templates UI (submit to Meta)
- [ ] Auto-seed pack on Connect (optional later)

## Campaigns Pro notes

- **CSV audience:** columns `phone,name,email,company,tags` → upserts/matches contacts, audience mode `contacts`.
- **Custom merge:** `{{contact.custom.<field_key>}}` (slug from custom field name).
- **CTR:** Quick-reply taps use Meta webhook (`type=button`). URL opens need a dynamic URL button whose template base is `{SITE}/r/{{1}}` and an absolute `https://…` destination in the campaign URL slot (rewritten to a tracked redirect). Static full URLs without `{{1}}` are not tracked.

## Ops

1. Apply migrations through `048_campaigns_pro_merge_ctr.sql` on Supabase.
2. Set production `NEXT_PUBLIC_SITE_URL=https://wa.vsmarttec.net`.
3. Meta webhook: `https://wa.vsmarttec.net/api/whatsapp/webhook`.
4. Set `SENTRY_DSN` (see ENTERPRISE.md).
5. CRM Lightsail: `WA_STUDIO_BASE_URL=https://wa.vsmarttec.net` + API key + approved template names.
6. Studio Settings → Webhooks → CRM receiver URL for status updates.

## Positioning

Sell **CRM-grade WhatsApp** (ticket notify + automations + compliant campaigns), not “another inbox.”
