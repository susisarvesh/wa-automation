-- Remove Employees product surface.
-- Keep company multi-number columns (label, is_primary, phone_number_id).

ALTER TABLE public.whatsapp_config DROP COLUMN IF EXISTS employee_id;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS employee_id;

DROP TABLE IF EXISTS public.employees CASCADE;
