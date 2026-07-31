import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

/**
 * GET /api/automations/:id/runs
 *
 * Recent automation_logs with inbox deep-links (`/inbox?c=<conversation_id>`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("viewer");
    const { id } = await params;
    const admin = supabaseAdmin();

    const { data: automation } = await admin
      .from("automations")
      .select("id")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (!automation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: logs, error } = await admin
      .from("automation_logs")
      .select("id, contact_id, status, created_at, steps_executed")
      .eq("account_id", ctx.accountId)
      .eq("automation_id", id)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const contactIds = [
      ...new Set(
        (logs ?? [])
          .map((l) => l.contact_id as string | null)
          .filter((c): c is string => Boolean(c)),
      ),
    ];

    const contactNameById = new Map<string, string>();
    const convByContact = new Map<string, string>();

    if (contactIds.length > 0) {
      const [{ data: contacts }, { data: conversations }] = await Promise.all([
        admin
          .from("contacts")
          .select("id, name, phone")
          .eq("account_id", ctx.accountId)
          .in("id", contactIds),
        admin
          .from("conversations")
          .select("id, contact_id, updated_at")
          .eq("account_id", ctx.accountId)
          .in("contact_id", contactIds)
          .order("updated_at", { ascending: false }),
      ]);

      for (const c of contacts ?? []) {
        const label =
          ((c.name as string) || "").trim() ||
          (c.phone as string) ||
          "Customer";
        contactNameById.set(c.id as string, label);
      }
      for (const conv of conversations ?? []) {
        const cid = conv.contact_id as string;
        if (!convByContact.has(cid)) {
          convByContact.set(cid, conv.id as string);
        }
      }
    }

    const runs = (logs ?? []).map((l) => {
      const contactId = (l.contact_id as string) || null;
      const conversationId = contactId
        ? convByContact.get(contactId) ?? null
        : null;
      return {
        id: l.id as string,
        status: l.status as string,
        created_at: l.created_at as string,
        contact_id: contactId,
        contact_name: contactId
          ? contactNameById.get(contactId) ?? "Customer"
          : null,
        conversation_id: conversationId,
        inbox_href: conversationId ? `/inbox?c=${conversationId}` : null,
      };
    });

    return NextResponse.json({ runs });
  } catch (err) {
    return toErrorResponse(err);
  }
}
