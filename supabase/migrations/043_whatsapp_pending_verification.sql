-- Allow OTP onboarding rows before Meta SMS verify + /register complete.
ALTER TABLE public.whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_status_check;

ALTER TABLE public.whatsapp_config
  ADD CONSTRAINT whatsapp_config_status_check
  CHECK (status IN ('connected', 'disconnected', 'pending_verification'));
