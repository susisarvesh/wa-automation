-- Remove Employees product surface; keep a single company WhatsApp number.
-- Conversations may still carry phone_number_id for reply routing history.

-- Drop employee FKs / columns first.
ALTER TABLE whatsapp_config DROP COLUMN IF EXISTS employee_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS employee_id;

DROP TABLE IF EXISTS employees CASCADE;

-- Collapse to one config row per account (keep oldest / primary).
WITH ranked AS (
  SELECT
    id,
    account_id,
    ROW_NUMBER() OVER (
      PARTITION BY account_id
      ORDER BY
        CASE WHEN COALESCE(is_primary, false) THEN 0 ELSE 1 END,
        created_at ASC NULLS LAST
    ) AS rn
  FROM whatsapp_config
)
DELETE FROM whatsapp_config w
USING ranked r
WHERE w.id = r.id AND r.rn > 1;

UPDATE whatsapp_config SET is_primary = true WHERE is_primary IS DISTINCT FROM true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_config_account_id_key'
  ) THEN
    ALTER TABLE whatsapp_config
      ADD CONSTRAINT whatsapp_config_account_id_key UNIQUE (account_id);
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'Could not add UNIQUE(account_id) — resolve remaining duplicates manually';
END $$;

-- Allow cancelling in-flight campaigns.
ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
ALTER TABLE broadcasts
  ADD CONSTRAINT broadcasts_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'));

ALTER TABLE broadcast_recipients DROP CONSTRAINT IF EXISTS broadcast_recipients_status_check;
ALTER TABLE broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_status_check
  CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed', 'cancelled'));
