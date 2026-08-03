-- ============================================================
-- 048: Campaigns Pro — custom merge keys + funnel CTR
--   - custom_fields.field_key (slug) for {{contact.custom.*}}
--   - broadcast_recipients.reply_payload / clicked_at
--   - broadcasts.clicked_count (+ first-click bump trigger)
-- ============================================================

-- Custom field merge keys
ALTER TABLE custom_fields
  ADD COLUMN IF NOT EXISTS field_key TEXT;

UPDATE custom_fields
SET field_key = trim(both '_' from regexp_replace(lower(trim(field_name)), '[^a-z0-9]+', '_', 'g'))
WHERE field_key IS NULL OR field_key = '';

-- Ensure uniqueness within an account (append short id on collisions)
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN
    SELECT id, account_id, field_key
    FROM custom_fields
    WHERE field_key IS NOT NULL
    ORDER BY created_at ASC NULLS FIRST, id ASC
  LOOP
    base := COALESCE(NULLIF(r.field_key, ''), 'field');
    candidate := base;
    n := 1;
    WHILE EXISTS (
      SELECT 1 FROM custom_fields cf
      WHERE cf.account_id = r.account_id
        AND cf.field_key = candidate
        AND cf.id <> r.id
    ) LOOP
      n := n + 1;
      candidate := base || '_' || n;
    END LOOP;
    IF candidate <> r.field_key THEN
      UPDATE custom_fields SET field_key = candidate WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

ALTER TABLE custom_fields
  ALTER COLUMN field_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_fields_account_field_key
  ON custom_fields (account_id, field_key);

-- Recipient click / QR payload attribution
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS reply_payload TEXT;

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS clicked_count INTEGER NOT NULL DEFAULT 0;

-- First-click bump (NULL → set) on recipients
CREATE OR REPLACE FUNCTION public.broadcast_recipient_click_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.clicked_at IS NULL
     AND NEW.clicked_at IS NOT NULL THEN
    PERFORM _bcast_bump(NEW.broadcast_id, 'clicked_count', 1);
  ELSIF TG_OP = 'UPDATE'
     AND OLD.clicked_at IS NOT NULL
     AND NEW.clicked_at IS NULL THEN
    PERFORM _bcast_bump(NEW.broadcast_id, 'clicked_count', -1);
  ELSIF TG_OP = 'INSERT'
     AND NEW.clicked_at IS NOT NULL THEN
    PERFORM _bcast_bump(NEW.broadcast_id, 'clicked_count', 1);
  ELSIF TG_OP = 'DELETE'
     AND OLD.clicked_at IS NOT NULL THEN
    PERFORM _bcast_bump(OLD.broadcast_id, 'clicked_count', -1);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_broadcast_recipient_click ON broadcast_recipients;
CREATE TRIGGER trg_broadcast_recipient_click
  AFTER INSERT OR UPDATE OF clicked_at OR DELETE
  ON broadcast_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_recipient_click_trigger();

-- Extend recompute safety net to include clicked_count
CREATE OR REPLACE FUNCTION public.recompute_broadcast_counts(bid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE broadcasts b SET
    sent_count      = agg.sent_count,
    delivered_count = agg.delivered_count,
    read_count      = agg.read_count,
    replied_count   = agg.replied_count,
    failed_count    = agg.failed_count,
    clicked_count   = agg.clicked_count,
    updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('sent','delivered','read','replied')) AS sent_count,
      COUNT(*) FILTER (WHERE status IN ('delivered','read','replied'))        AS delivered_count,
      COUNT(*) FILTER (WHERE status IN ('read','replied'))                    AS read_count,
      COUNT(*) FILTER (WHERE status = 'replied')                              AS replied_count,
      COUNT(*) FILTER (WHERE status = 'failed')                               AS failed_count,
      COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)                          AS clicked_count
    FROM broadcast_recipients
    WHERE broadcast_id = bid
  ) agg
  WHERE b.id = bid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
