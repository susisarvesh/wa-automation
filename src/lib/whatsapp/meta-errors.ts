/**
 * Map Meta Graph API / connect failures to plain-language copy for owners.
 */

/** Meta #100/2388094 — platform sample HSMs are immutable. */
export function isMetaSampleTemplateError(
  raw: string | undefined | null,
): boolean {
  const lower = (raw ?? "").toLowerCase();
  return (
    lower.includes("2388094") ||
    lower.includes("sample templates cannot") ||
    (lower.includes("sample template") &&
      (lower.includes("cannot be edited") ||
        lower.includes("cannot be deleted") ||
        lower.includes("can't be edited") ||
        lower.includes("can't be deleted")))
  );
}

/** Heuristic for Meta-provided demo templates synced into the catalog. */
export function isLikelyMetaSampleTemplateName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === "hello_world" ||
    n.startsWith("jaspers_") ||
    n.startsWith("sample_") ||
    n.endsWith("_sample") ||
    n.includes("_sample_")
  );
}

/**
 * Templates shown in Studio lists / pickers.
 * Hides Meta demo samples (jaspers_*, hello_world, …). Prefer vsmart_* brand names.
 */
export function isWorkspaceVisibleTemplateName(name: string): boolean {
  if (!name?.trim()) return false;
  if (isLikelyMetaSampleTemplateName(name)) return false;
  return true;
}

/** Brand-preferred workspace templates (vsmart_*). */
export function isVsmartTemplateName(name: string): boolean {
  return name.trim().toLowerCase().startsWith("vsmart_");
}

export function humanizeMetaError(raw: string | undefined | null): string {
  const msg = (raw ?? "").trim();
  if (!msg) return "Something went wrong talking to Meta. Try again.";

  const lower = msg.toLowerCase();

  if (isMetaSampleTemplateError(msg)) {
    return "This is a Meta sample template — it can’t be edited or deleted on Meta. Save creates your own copy, or Delete removes it from this app only.";
  }

  if (
    lower.includes("session has expired") ||
    lower.includes("error validating access token") ||
    lower.includes("oauth") ||
    lower.includes("invalid oauth") ||
    lower.includes("(#190)")
  ) {
    return "Your Meta access token expired or was revoked. Generate a new permanent token in Meta Developer Console and reconnect.";
  }

  if (
    lower.includes("unsupported get request") ||
    (lower.includes("does not exist") && lower.includes("phone"))
  ) {
    return "Wrong Phone number ID — copy it again from Meta → WhatsApp → API Setup.";
  }

  if (
    lower.includes("too many times") ||
    lower.includes("136024") ||
    (lower.includes("verification code") && lower.includes("later"))
  ) {
    return "Meta blocked more SMS codes for this number. Wait 1–2 hours (sometimes up to 24h), then use Resend SMS once. If a code already arrived, enter it now — do not keep clicking Send.";
  }

  if (
    lower.includes("(#131009)") ||
    ((lower.includes("invalid parameter") ||
      lower.includes("parameter value is not valid") ||
      lower.includes("(#100)")) &&
      (lower.includes("phone") ||
        lower.includes("display name") ||
        lower.includes("cc") ||
        lower.includes("national")))
  ) {
    return "Meta rejected this phone or display name. Use a full international number that can receive SMS (not personal WhatsApp), and a real business display name (e.g. “Ma Store”, not a single letter). For India use +91…";
  }

  if (
    lower.includes("two-step") ||
    lower.includes("pin") ||
    lower.includes("133005") ||
    lower.includes("133006")
  ) {
    return "Meta needs your 6-digit two-step verification PIN to register this number. Enter it on Connect and try again.";
  }

  if (
    lower.includes("not registered") ||
    lower.includes("webhook") ||
    lower.includes("subscribed")
  ) {
    return "Webhook or app subscription looks incomplete. Confirm the Callback URL + verify token in Meta match this app, then reconnect.";
  }

  if (
    lower.includes("recipient") ||
    lower.includes("not in allowed") ||
    lower.includes("131030") ||
    lower.includes("not a valid whatsapp")
  ) {
    return "That recipient can’t receive messages yet. For test numbers, add them under Meta → API Setup → To. Outside the 24h window, use an approved template.";
  }

  if (
    lower.includes("rate limit") ||
    lower.includes("request limit reached") ||
    lower.includes("too many calls") ||
    lower.includes("(#4)") ||
    lower.includes("80007") ||
    lower.includes("613")
  ) {
    return "Meta rate-limited this request. Wait 5–10 minutes, then try once more. Do not keep retrying.";
  }

  if (lower.includes("permission") || lower.includes("(#10)")) {
    return "This token is missing WhatsApp permissions. Use a System User token with whatsapp_business_messaging.";
  }

  // Keep Meta’s message as a trailing detail when it’s short.
  if (msg.length < 180) return msg;
  return `${msg.slice(0, 160)}…`;
}
