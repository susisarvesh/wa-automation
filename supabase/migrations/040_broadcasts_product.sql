-- ============================================================
-- 040_broadcasts_product.sql
-- Indexes + optional timestamps for campaign product UI.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_broadcasts_account_status_scheduled
  ON public.broadcasts (account_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast_status
  ON public.broadcast_recipients (broadcast_id, status);

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
