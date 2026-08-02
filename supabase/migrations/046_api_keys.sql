-- ============================================================
-- 046_api_keys.sql
-- Account-scoped API tokens for external integrations (CRM, scripts).
-- Plaintext token is shown once at create; only SHA-256 hash is stored.
--
-- Column names match the existing production table (key_prefix / key_hash).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['messages:send', 'account:read']::TEXT[],
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If an older draft used token_* names, rename when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'api_keys' AND column_name = 'token_hash'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'api_keys' AND column_name = 'key_hash'
  ) THEN
    ALTER TABLE public.api_keys RENAME COLUMN token_hash TO key_hash;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'api_keys' AND column_name = 'token_prefix'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'api_keys' AND column_name = 'key_prefix'
  ) THEN
    ALTER TABLE public.api_keys RENAME COLUMN token_prefix TO key_prefix;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_keys_account
  ON public.api_keys (account_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
  ON public.api_keys (key_prefix)
  WHERE revoked_at IS NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_select ON public.api_keys;
DROP POLICY IF EXISTS api_keys_insert ON public.api_keys;
DROP POLICY IF EXISTS api_keys_update ON public.api_keys;
DROP POLICY IF EXISTS api_keys_delete ON public.api_keys;

CREATE POLICY api_keys_select ON public.api_keys
  FOR SELECT USING (is_account_member(account_id, 'admin'));

CREATE POLICY api_keys_insert ON public.api_keys
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY api_keys_update ON public.api_keys
  FOR UPDATE USING (is_account_member(account_id, 'admin'));

CREATE POLICY api_keys_delete ON public.api_keys
  FOR DELETE USING (is_account_member(account_id, 'admin'));
