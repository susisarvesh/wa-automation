import type { SupabaseClient } from "@supabase/supabase-js";

const STOP_RE =
  /^\s*(stop|unsubscribe|cancel|end|quit|opt[\s-]?out)\s*$/i;

/**
 * Detect STOP-style inbound text and mark the contact opted out.
 */
export async function maybeApplyOptOutFromInbound(
  admin: SupabaseClient,
  contactId: string,
  text: string | null | undefined,
): Promise<boolean> {
  if (!text || !STOP_RE.test(text)) return false;
  await admin
    .from("contacts")
    .update({
      whatsapp_opt_out: true,
      marketing_opt_out: true,
      opt_out_at: new Date().toISOString(),
      opt_out_reason: "inbound_stop",
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);
  return true;
}

export async function isContactWhatsAppOptedOut(
  admin: SupabaseClient,
  contactId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("contacts")
    .select("whatsapp_opt_out")
    .eq("id", contactId)
    .maybeSingle();
  return Boolean(data?.whatsapp_opt_out);
}

export async function isPhoneWhatsAppOptedOut(
  admin: SupabaseClient,
  accountId: string,
  phone: string,
): Promise<boolean> {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return false;
  const { data } = await admin
    .from("contacts")
    .select("whatsapp_opt_out")
    .eq("account_id", accountId)
    .eq("phone_normalized", digits)
    .maybeSingle();
  return Boolean(data?.whatsapp_opt_out);
}
