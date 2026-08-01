-- ============================================================
-- 042_multi_whatsapp_numbers.sql
-- Allow multiple Meta Cloud API phone numbers per account.
-- ============================================================

-- Drop one-row-per-account constraint (keep UNIQUE phone_number_id).
ALTER TABLE public.whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_account_id_key;

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- Existing rows become the primary line for their account.
UPDATE public.whatsapp_config
SET is_primary = true
WHERE is_primary = false
  AND id IN (
    SELECT DISTINCT ON (account_id) id
    FROM public.whatsapp_config
    ORDER BY account_id, created_at ASC NULLS LAST, id ASC
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_config_one_primary
  ON public.whatsapp_config (account_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_account_employee
  ON public.whatsapp_config (account_id, employee_id)
  WHERE employee_id IS NOT NULL;

-- Which Meta line a conversation is on (for correct outbound replies).
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS phone_number_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_phone_number
  ON public.conversations (account_id, phone_number_id)
  WHERE phone_number_id IS NOT NULL;
