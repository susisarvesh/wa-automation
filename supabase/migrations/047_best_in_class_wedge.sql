-- ============================================================
-- 047: Best-in-class wedge foundations
--   - Contact WhatsApp opt-out / marketing consent
--   - API idempotency ledger for /api/v1/messages
--   - Outbound webhook endpoints (CRM status fan-out)
--   - Automation last_run / last_error visibility
--   - Broadcast quiet hours + frequency caps (account settings)
-- ============================================================

-- Contacts: opt-out
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS marketing_opt_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS opt_out_at TIMESTAMPTZ;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS opt_out_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_opt_out
  ON contacts (account_id)
  WHERE whatsapp_opt_out = true;

CREATE INDEX IF NOT EXISTS idx_contacts_marketing_opt_out
  ON contacts (account_id)
  WHERE marketing_opt_out = true;

-- API idempotency
CREATE TABLE IF NOT EXISTS api_idempotency (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT,
  response_status INT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_created
  ON api_idempotency (created_at);

ALTER TABLE api_idempotency ENABLE ROW LEVEL SECURITY;

-- Service role / API routes use admin client; no user policies needed.
-- Keep RLS on so anon/authenticated cannot read ledger.

-- Outbound webhook endpoints (Studio → CRM)
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret_encrypted TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['message.status_updated']::TEXT[],
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_account
  ON webhook_endpoints (account_id)
  WHERE active = true;

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_endpoints_select ON webhook_endpoints
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY webhook_endpoints_insert ON webhook_endpoints
  FOR INSERT WITH CHECK (can_edit_settings(account_id));

CREATE POLICY webhook_endpoints_update ON webhook_endpoints
  FOR UPDATE USING (can_edit_settings(account_id));

CREATE POLICY webhook_endpoints_delete ON webhook_endpoints
  FOR DELETE USING (can_edit_settings(account_id));

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON webhook_deliveries (status, created_at)
  WHERE status = 'pending';

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_select ON webhook_deliveries
  FOR SELECT USING (is_account_member(account_id));

-- Automations: run visibility
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS last_run_status TEXT;

-- Account messaging policy (quiet hours + frequency)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS messaging_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Broadcast: optional per-campaign overrides stored already in audience_filter;
-- add columns for quiet hours skip / frequency
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS respect_opt_out BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS respect_quiet_hours BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS max_per_contact_per_day INT;

COMMENT ON COLUMN contacts.whatsapp_opt_out IS 'Global STOP — exclude from all outbound WA including Utility API sends when enforced';
COMMENT ON COLUMN contacts.marketing_opt_out IS 'Exclude from Marketing-category campaigns';
COMMENT ON TABLE webhook_endpoints IS 'Signed outbound webhooks for CRM / integrations';
COMMENT ON TABLE api_idempotency IS 'Idempotency-Key ledger for public API POSTs';
