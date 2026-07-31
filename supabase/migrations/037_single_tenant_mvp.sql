-- ============================================================
-- MVP single-tenant open access (NOT production-safe)
--
-- Adds permissive RLS policies scoped ONLY to the fixed MVP
-- account id so anon clients can read/write that workspace
-- without a login session. Other accounts remain protected by
-- existing is_account_member policies.
-- ============================================================

-- Seed workspace row if missing. owner_user_id is filled by the
-- app bootstrap (auth.admin.createUser) on first request; we only
-- ensure the UUID exists for FK stamps when the app inserts rows.
-- If accounts.owner_user_id is NOT NULL and no user exists yet,
-- the app creates both — this block is a no-op placeholder for
-- documentation. Account creation happens in application code.

-- Domain tables: allow anon/authenticated full access for MVP account.
DO $$
DECLARE
  mvp uuid := 'a0000000-0000-4000-8000-000000000001';
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
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'account_id'
    ) THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS mvp_st_all ON %I',
        t
      );
      EXECUTE format(
        'CREATE POLICY mvp_st_all ON %I FOR ALL TO anon, authenticated
         USING (account_id = %L) WITH CHECK (account_id = %L)',
        t, mvp, mvp
      );
    END IF;
  END LOOP;
END $$;

-- Junction / child tables without account_id — open via parent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    DROP POLICY IF EXISTS mvp_st_messages ON messages;
    CREATE POLICY mvp_st_messages ON messages FOR ALL TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM conversations c
          WHERE c.id = messages.conversation_id
            AND c.account_id = 'a0000000-0000-4000-8000-000000000001'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM conversations c
          WHERE c.id = messages.conversation_id
            AND c.account_id = 'a0000000-0000-4000-8000-000000000001'
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contact_tags') THEN
    DROP POLICY IF EXISTS mvp_st_contact_tags ON contact_tags;
    CREATE POLICY mvp_st_contact_tags ON contact_tags FOR ALL TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM contacts c
          WHERE c.id = contact_tags.contact_id
            AND c.account_id = 'a0000000-0000-4000-8000-000000000001'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM contacts c
          WHERE c.id = contact_tags.contact_id
            AND c.account_id = 'a0000000-0000-4000-8000-000000000001'
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'automation_steps') THEN
    DROP POLICY IF EXISTS mvp_st_automation_steps ON automation_steps;
    CREATE POLICY mvp_st_automation_steps ON automation_steps FOR ALL TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM automations a
          WHERE a.id = automation_steps.automation_id
            AND a.account_id = 'a0000000-0000-4000-8000-000000000001'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM automations a
          WHERE a.id = automation_steps.automation_id
            AND a.account_id = 'a0000000-0000-4000-8000-000000000001'
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts') THEN
    DROP POLICY IF EXISTS mvp_st_accounts ON accounts;
    CREATE POLICY mvp_st_accounts ON accounts FOR SELECT TO anon, authenticated
      USING (id = 'a0000000-0000-4000-8000-000000000001');
  END IF;
END $$;
