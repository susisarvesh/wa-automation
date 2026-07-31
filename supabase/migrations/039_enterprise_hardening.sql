-- ============================================================
-- 039_enterprise_hardening.sql
-- Tenant isolation leftovers, audit log, webhook idempotency,
-- durable job queue for async processing.
-- ============================================================

-- Leftover from 037 not covered by 038 (notifications table).
DROP POLICY IF EXISTS mvp_st_all ON notifications;

-- ---------- audit_logs ----------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_account_created
  ON public.audit_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
  ON public.audit_logs(action, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_admin ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    account_id IS NOT NULL
    AND public.is_account_member(account_id, 'admin')
  );

-- ---------- webhook_events (idempotency) ----------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,
  wamid TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('message', 'status', 'template')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phone_number_id, wamid, event_type)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_account
  ON public.webhook_events(account_id, created_at DESC);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- No client policies — service role only.

-- ---------- job_queue ----------
CREATE TABLE IF NOT EXISTS public.job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'dead')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_due
  ON public.job_queue(status, run_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_job_queue_account
  ON public.job_queue(account_id, created_at DESC);

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;
-- Service role only.

-- ---------- platform_invites (invite-by-email before first login) ----------
CREATE TABLE IF NOT EXISTS public.platform_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_invites_email_pending
  ON public.platform_invites (lower(email))
  WHERE status = 'pending';

ALTER TABLE public.platform_invites ENABLE ROW LEVEL SECURITY;
-- Service role / admin API only.
