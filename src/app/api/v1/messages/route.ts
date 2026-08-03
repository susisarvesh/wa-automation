import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth/api-keys";
import { v1Error, v1FromError, v1Ok } from "@/lib/api/v1";
import {
  getIdempotencyKey,
  hashRequestBody,
  lookupIdempotentResponse,
  storeIdempotentResponse,
} from "@/lib/api/idempotency";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import {
  sendMessageToConversation,
  validateSendMessageParams,
  SendMessageError,
} from "@/lib/whatsapp/send-message";
import {
  ensureContactAndConversation,
  getAccountOwnerUserId,
} from "@/lib/whatsapp/ensure-conversation";
import { isPhoneWhatsAppOptedOut } from "@/lib/contacts/opt-out";

/**
 * POST /api/v1/messages
 * Send a text or template WhatsApp message to a phone number.
 * Supports Idempotency-Key header.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, "messages:send");
    const limit = checkRateLimit(
      `publicApi:${ctx.keyId}`,
      RATE_LIMITS.publicApi,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const accountLimit = checkRateLimit(
      `send:account:${ctx.accountId}`,
      RATE_LIMITS.sendAccount,
    );
    if (!accountLimit.success) return rateLimitResponse(accountLimit);

    const rawText = await request.text();
    const idemKey = getIdempotencyKey(request);
    const admin = supabaseAdmin();

    const replay = await lookupIdempotentResponse(
      admin,
      ctx.accountId,
      idemKey,
    );
    if (replay) return replay;

    let body: Record<string, unknown> | null = null;
    try {
      body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
    } catch {
      return v1Error("bad_request", "Invalid JSON body", 400);
    }
    if (!body || typeof body !== "object") {
      return v1Error("bad_request", "Invalid JSON body", 400);
    }

    const to = typeof body.to === "string" ? body.to.trim() : "";
    const type =
      typeof body.type === "string"
        ? body.type.trim()
        : typeof body.message_type === "string"
          ? String(body.message_type).trim()
          : "";

    if (!to || !type) {
      return v1Error("bad_request", "to and type are required", 400);
    }
    if (type !== "text" && type !== "template") {
      return v1Error(
        "bad_request",
        'type must be "text" or "template"',
        400,
      );
    }

    if (await isPhoneWhatsAppOptedOut(admin, ctx.accountId, to)) {
      const errBody = {
        error: {
          code: "opted_out",
          message: "Contact has opted out of WhatsApp messages",
        },
      };
      await storeIdempotentResponse(
        admin,
        ctx.accountId,
        idemKey,
        hashRequestBody(rawText),
        409,
        errBody,
      );
      return NextResponse.json(errBody, { status: 409 });
    }

    const text =
      typeof body.text === "string"
        ? body.text
        : typeof body.content_text === "string"
          ? body.content_text
          : null;
    const templateName =
      typeof body.template_name === "string" ? body.template_name.trim() : null;
    const language =
      typeof body.language === "string" && body.language
        ? body.language
        : typeof body.template_language === "string" && body.template_language
          ? body.template_language
          : "en_US";

    const bodyParams = Array.isArray(body.body_params)
      ? body.body_params.map((p: unknown) => String(p ?? ""))
      : Array.isArray(body.template_params)
        ? body.template_params.map((p: unknown) => String(p ?? ""))
        : [];

    const headerText =
      typeof body.header_text === "string" ? body.header_text : undefined;
    const buttonParams =
      body.button_params && typeof body.button_params === "object"
        ? (body.button_params as Record<string, string>)
        : undefined;

    try {
      validateSendMessageParams({
        messageType: type,
        contentText: text as string | null,
        templateName,
      });
    } catch (err) {
      if (err instanceof SendMessageError) {
        return v1Error(err.code, err.message, err.status);
      }
      throw err;
    }

    const ownerUserId = await getAccountOwnerUserId(admin, ctx.accountId);
    const contactName =
      typeof body.customer_name === "string"
        ? body.customer_name
        : typeof body.contact_name === "string"
          ? body.contact_name
          : null;

    let conversationId: string;
    try {
      const ensured = await ensureContactAndConversation(
        admin,
        ctx.accountId,
        ownerUserId,
        to,
        contactName as string | null,
      );
      conversationId = ensured.conversationId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid phone";
      return v1Error("bad_request", msg, 400);
    }

    const templateMessageParams =
      type === "template"
        ? {
            body: bodyParams,
            ...(headerText !== undefined ? { headerText } : {}),
            ...(buttonParams
              ? {
                  buttonParams: Object.fromEntries(
                    Object.entries(buttonParams).map(([k, v]) => [
                      Number(k),
                      String(v ?? ""),
                    ]),
                  ),
                }
              : {}),
          }
        : undefined;

    const result = await sendMessageToConversation(admin, ctx.accountId, {
      conversationId,
      messageType: type,
      contentText: text as string | null,
      templateName,
      templateLanguage: language as string,
      templateParams: bodyParams,
      templateMessageParams,
    });

    const okBody = {
      data: {
        message_id: result.messageId,
        whatsapp_message_id: result.whatsappMessageId,
        conversation_id: conversationId,
      },
    };
    await storeIdempotentResponse(
      admin,
      ctx.accountId,
      idemKey,
      hashRequestBody(rawText),
      201,
      okBody,
    );
    return NextResponse.json(okBody, { status: 201 });
  } catch (err) {
    return v1FromError(err);
  }
}
