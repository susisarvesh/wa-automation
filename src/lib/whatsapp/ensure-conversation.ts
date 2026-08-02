import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidE164, sanitizePhoneForMeta } from "@/lib/whatsapp/phone-utils";

/**
 * Find or create a contact + open conversation for an E.164 phone.
 * Used by the public API (`to` phone) path.
 */
export async function ensureContactAndConversation(
  admin: SupabaseClient,
  accountId: string,
  ownerUserId: string,
  rawPhone: string,
  contactName?: string | null,
): Promise<{ contactId: string; conversationId: string; phone: string }> {
  const phone = sanitizePhoneForMeta(rawPhone);
  if (!phone || !isValidE164(phone)) {
    throw new Error("to must be a valid E.164 phone number");
  }

  const { data: existingContact } = await admin
    .from("contacts")
    .select("id")
    .eq("account_id", accountId)
    .eq("phone", phone)
    .maybeSingle();

  let contactId = existingContact?.id as string | undefined;

  if (!contactId) {
    const { data: created, error } = await admin
      .from("contacts")
      .insert({
        account_id: accountId,
        user_id: ownerUserId,
        phone,
        name: contactName?.trim() || phone,
      })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error(error?.message ?? "Failed to create contact");
    }
    contactId = created.id as string;
  } else if (contactName?.trim()) {
    await admin
      .from("contacts")
      .update({ name: contactName.trim() })
      .eq("id", contactId)
      .eq("account_id", accountId);
  }

  const { data: existingConvs } = await admin
    .from("conversations")
    .select("id")
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingConvs?.[0]?.id) {
    return {
      contactId,
      conversationId: existingConvs[0].id as string,
      phone,
    };
  }

  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .insert({
      account_id: accountId,
      user_id: ownerUserId,
      contact_id: contactId,
    })
    .select("id")
    .single();

  if (convErr || !conv) {
    // Race: another request created it
    const { data: raced } = await admin
      .from("conversations")
      .select("id")
      .eq("account_id", accountId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (raced?.id) {
      return {
        contactId,
        conversationId: raced.id as string,
        phone,
      };
    }
    throw new Error(convErr?.message ?? "Failed to open conversation");
  }

  return {
    contactId,
    conversationId: conv.id as string,
    phone,
  };
}

export async function getAccountOwnerUserId(
  admin: SupabaseClient,
  accountId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("accounts")
    .select("owner_user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data?.owner_user_id) {
    throw new Error("Account not found");
  }
  return data.owner_user_id as string;
}
