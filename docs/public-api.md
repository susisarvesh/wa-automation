# WhatsApp Studio public API

Drive this workspace from Vsmart CRM or your own software using **API keys**.

**Base URL (production):** `https://wa.vsmarttec.net/api/v1`  
(also: `https://wa-automation-one.vercel.app/api/v1`)

## Auth

1. In Studio: **Settings → API keys → Create API key** (admin).
2. Copy the token once (`wak_…`). Store it as a secret in CRM.
3. Send on every request:

```http
Authorization: Bearer wak_<prefix>_<secret>
Content-Type: application/json
Idempotency-Key: ticket:VS-123:created   # optional, strongly recommended
```

Scopes:

| Scope | Ability |
|-------|---------|
| `account:read` | `GET /me`, list contacts/conversations (fallback) |
| `messages:send` | `POST /messages` |
| `contacts:read` / `contacts:write` | Contacts API |
| `conversations:read` | Conversation history |

## Endpoints

### `GET /me`

Probe the key and WhatsApp connection.

### `POST /messages`

Send **text** or **template**. Honors **Idempotency-Key** (replay same response). Returns `409 opted_out` if the contact sent STOP.

Optional: `header_text`, `button_params`.

Success `201`:

```json
{
  "data": {
    "message_id": "…",
    "whatsapp_message_id": "wamid.…",
    "conversation_id": "…"
  }
}
```

### `GET /contacts` · `POST /contacts`

List/search by `?phone=` or `?q=`, or upsert a contact + conversation.

### `GET /conversations/:id/messages`

Recent message history for CRM sync (`?limit=50`).

## Outbound webhooks (Studio → CRM)

**Settings → Webhooks** — register an HTTPS URL. Events:

- `message.status_updated` — Meta delivery ladder (`sent` / `delivered` / `read` / `failed`)
- `message.received` — (subscribe; fan-out expanding)

Headers:

- `X-Wacrm-Timestamp` — unix seconds
- `X-Wacrm-Signature` — HMAC-SHA256 hex of `timestamp.body` with the endpoint secret

## CRM env

```bash
WA_STUDIO_BASE_URL=https://wa.vsmarttec.net
WA_STUDIO_API_KEY=wak_...
WA_STUDIO_TEMPLATE_CREATED=vsmart_ticket_created_v1
WA_STUDIO_TEMPLATE_STATUS=vsmart_ticket_status_v1
WA_STUDIO_TEMPLATE_CLOSED=vsmart_ticket_closed_v1
WA_STUDIO_TEMPLATE_LANG=en_US
```

Approve those Utility templates in Meta first (Templates → **Vsmart enterprise pack** → Use template → Submit). CRM client sends `Idempotency-Key: ticket:<id>:<event>` and retries failed posts.

### Ticket template bodies (en_US)

| Name | Vars | Purpose |
|------|------|---------|
| `vsmart_ticket_created_v1` | `{{1}}` name, `{{2}}` ticket id, `{{3}}` summary | Ticket opened |
| `vsmart_ticket_status_v1` | `{{1}}` name, `{{2}}` ticket id, `{{3}}` status, `{{4}}` note | Status change |
| `vsmart_ticket_closed_v1` | `{{1}}` name, `{{2}}` ticket id, `{{3}}` resolution | Closed / resolved |

Also in the pack: site visit, AMC reminder, appointment, quote ready, lead follow-up, campaign offer (tracked URL), re-engage. See `src/lib/whatsapp/vsmart-enterprise-templates.ts`.

## Limits

~120 requests/minute per API key. Also subject to the account WhatsApp send budget.

## Compliance

Inbound `STOP` / `UNSUBSCRIBE` marks `contacts.whatsapp_opt_out` (+ marketing). Campaigns exclude opted-out contacts. Quiet hours / frequency caps live on `accounts.messaging_policy` and broadcast flags.
