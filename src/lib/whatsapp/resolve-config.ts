import type { SupabaseClient } from "@supabase/supabase-js";

export type WhatsAppConfigRow = {
  id: string;
  account_id: string;
  user_id: string;
  phone_number_id: string;
  waba_id: string | null;
  access_token: string;
  verify_token: string | null;
  status: string;
  label?: string | null;
  employee_id?: string | null;
  is_primary?: boolean;
  connected_at?: string | null;
  registered_at?: string | null;
  subscribed_apps_at?: string | null;
  last_registration_error?: string | null;
};

/**
 * Resolve WhatsApp credentials for an account.
 * Prefer an explicit phone_number_id, else the primary line, else oldest row.
 */
export async function resolveWhatsAppConfig(
  db: SupabaseClient,
  accountId: string,
  phoneNumberId?: string | null,
): Promise<WhatsAppConfigRow | null> {
  if (phoneNumberId) {
    const { data, error } = await db
      .from("whatsapp_config")
      .select("*")
      .eq("account_id", accountId)
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    if (!error && data) return data as WhatsAppConfigRow;
  }

  const { data: primary } = await db
    .from("whatsapp_config")
    .select("*")
    .eq("account_id", accountId)
    .eq("is_primary", true)
    .maybeSingle();
  if (primary) return primary as WhatsAppConfigRow;

  const { data: anyRow } = await db
    .from("whatsapp_config")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (anyRow as WhatsAppConfigRow) ?? null;
}
