# WhatsApp Studio public API

Drive this workspace from Vsmart CRM or your own software using **API keys**.

**Base URL (production):** `https://wa-automation-one.vercel.app/api/v1`

## Auth

1. In Studio: **Settings → API keys → Create API key** (admin).
2. Copy the token once (`wak_…`). Store it as a secret in CRM.
3. Send on every request:

```http
Authorization: Bearer wak_<prefix>_<secret>
Content-Type: application/json
```

Scopes (MVP):

| Scope | Ability |
|-------|---------|
| `account:read` | `GET /me` |
| `messages:send` | `POST /messages` |

Revoking a key in Settings immediately returns `401`.

## Endpoints

### `GET /me`

Probe the key and WhatsApp connection.

```bash
curl -sS -H "Authorization: Bearer $WA_STUDIO_API_KEY" \
  https://wa-automation-one.vercel.app/api/v1/me
```

### `POST /messages`

Send a **text** or **template** message to an E.164 phone. Creates/finds the contact and conversation.

**Text**

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $WA_STUDIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"+919876543210","type":"text","text":"Hello from CRM"}' \
  https://wa-automation-one.vercel.app/api/v1/messages
```

**Template** (must be Meta-approved on the connected WABA)

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $WA_STUDIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+919876543210",
    "type": "template",
    "template_name": "ticket_created_v1",
    "language": "en_US",
    "customer_name": "Ada",
    "body_params": ["Ada", "VS/123", "Printer down"]
  }' \
  https://wa-automation-one.vercel.app/api/v1/messages
```

Optional: `header_text`, `button_params` (object keyed by button index).

## Response shape

Success: `{ "data": { ... } }`  
Error: `{ "error": { "code": "...", "message": "..." } }`

## CRM env

```bash
WA_STUDIO_BASE_URL=https://wa-automation-one.vercel.app
WA_STUDIO_API_KEY=wak_...
WA_STUDIO_TEMPLATE_CREATED=ticket_created_v1
WA_STUDIO_TEMPLATE_STATUS=ticket_status_v1
WA_STUDIO_TEMPLATE_CLOSED=ticket_closed_v1
WA_STUDIO_TEMPLATE_LANG=en_US
```

## Limits

~120 requests/minute per API key (in-process). Also subject to the account WhatsApp send budget.
