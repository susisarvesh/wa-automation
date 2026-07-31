-- ============================================================
-- 038_access_grants.sql
-- Platform access grants + drop MVP open RLS from 037.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.access_grants (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'revoked')),
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_grants_status
  ON public.access_grants(status);

CREATE INDEX IF NOT EXISTS idx_access_grants_email
  ON public.access_grants(lower(email));

ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_grants_select_own ON public.access_grants;
CREATE POLICY access_grants_select_own ON public.access_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Writes go through service role / admin API only (no INSERT/UPDATE for clients).

-- Drop permissive MVP open policies from migration 037 so tenants
-- cannot read/write the fixed demo UUID without membership.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contacts',
    'tags',
    'custom_fields',
    'contact_notes',
    'conversations',
    'whatsapp_config',
    'message_templates',
    'pipelines',
    'deals',
    'broadcasts',
    'automations',
    'automation_logs',
    'flows',
    'quick_replies'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'mvp_st_all'
    ) THEN
      EXECUTE format('DROP POLICY mvp_st_all ON %I', t);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS mvp_st_messages ON messages;
DROP POLICY IF EXISTS mvp_st_contact_tags ON contact_tags;
DROP POLICY IF EXISTS mvp_st_automation_steps ON automation_steps;
DROP POLICY IF EXISTS mvp_st_accounts ON accounts;
