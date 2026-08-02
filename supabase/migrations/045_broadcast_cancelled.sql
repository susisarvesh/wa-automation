-- Allow cancelling in-flight campaigns and marking leftover recipients.

ALTER TABLE public.broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
ALTER TABLE public.broadcasts
  ADD CONSTRAINT broadcasts_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'));

ALTER TABLE public.broadcast_recipients DROP CONSTRAINT IF EXISTS broadcast_recipients_status_check;
ALTER TABLE public.broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_status_check
  CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed', 'cancelled'));
