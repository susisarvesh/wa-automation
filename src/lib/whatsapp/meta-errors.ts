/**
 * Map Meta Graph API / connect failures to plain-language copy for owners.
 */

export function humanizeMetaError(raw: string | undefined | null): string {
  const msg = (raw ?? "").trim();
  if (!msg) return "Something went wrong talking to Meta. Try again.";

  const lower = msg.toLowerCase();

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
    lower.includes("does not exist") ||
    lower.includes("phone number id") ||
    lower.includes("(#100)")
  ) {
    return "Wrong Phone number ID — copy it again from Meta → WhatsApp → API Setup.";
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

  if (lower.includes("rate") || lower.includes("(#4)") || lower.includes("80007")) {
    return "Meta rate-limited this send. Wait a minute and try again.";
  }

  if (lower.includes("permission") || lower.includes("(#10)")) {
    return "This token is missing WhatsApp permissions. Use a System User token with whatsapp_business_messaging.";
  }

  // Keep Meta’s message as a trailing detail when it’s short.
  if (msg.length < 180) return msg;
  return `${msg.slice(0, 160)}…`;
}
