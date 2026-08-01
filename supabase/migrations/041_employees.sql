-- ============================================================
-- 041_employees.sql
-- Staff directory + optional conversation assignment by employee.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_account
  ON public.employees (account_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_account_phone
  ON public.employees (account_id, phone);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_employee
  ON public.conversations (account_id, employee_id)
  WHERE employee_id IS NOT NULL;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_select ON public.employees;
DROP POLICY IF EXISTS employees_insert ON public.employees;
DROP POLICY IF EXISTS employees_update ON public.employees;
DROP POLICY IF EXISTS employees_delete ON public.employees;

CREATE POLICY employees_select ON public.employees
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY employees_insert ON public.employees
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY employees_update ON public.employees
  FOR UPDATE USING (is_account_member(account_id, 'admin'));

CREATE POLICY employees_delete ON public.employees
  FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON public.employees;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
