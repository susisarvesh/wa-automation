import type { MessageTemplate, TemplateButton } from "@/types";

/**
 * Enterprise WhatsApp HSM pack for Vsmart Technologies.
 * Names for ticket Utility templates match docs/public-api.md CRM env vars.
 *
 * Categories follow Meta policy:
 * - Utility — ticket / visit / AMC / appointment (transactional)
 * - Marketing — offers, re-engagement, proactive sales follow-up
 */

export type VsmartTemplateUseCase =
  | "crm_tickets"
  | "field_service"
  | "sales"
  | "campaigns";

/** Same shape as TemplateFormData — kept here to avoid UI ↔ lib cycles. */
export type VsmartTemplateForm = {
  name: string;
  category: MessageTemplate["category"];
  language: string;
  header_format: "none" | "text" | "image" | "video" | "document";
  header_content: string;
  header_media_url: string;
  header_sample: string;
  body_text: string;
  body_samples: string[];
  footer_text: string;
  buttons: TemplateButton[];
};

export type VsmartEnterpriseTemplate = {
  id: string;
  title: string;
  description: string;
  useCase: VsmartTemplateUseCase;
  /** Short label shown on cards */
  badge: string;
  form: VsmartTemplateForm;
};

const FOOTER_UTILITY = "Vsmart Technologies";
const FOOTER_BRAND = "Vsmart Technologies · 15 years of excellence";
/** Matches CRM Contact Support modal (+91 96000 82811 / support@vsmarttec.com). */
export const VSMART_SUPPORT_PHONE_E164 = "919600082811";
export const VSMART_SUPPORT_PHONE_DISPLAY = "+91 96000 82811";
export const VSMART_SUPPORT_EMAIL = "support@vsmarttec.com";
const PHONE = VSMART_SUPPORT_PHONE_E164;
const WEB = "https://vsmarttec.com";

function base(
  partial: Omit<
    VsmartTemplateForm,
    "header_media_url" | "header_sample" | "language"
  > &
    Partial<
      Pick<VsmartTemplateForm, "header_media_url" | "header_sample" | "language">
    >,
): VsmartTemplateForm {
  return {
    header_media_url: "",
    header_sample: "",
    language: "en_US",
    ...partial,
  };
}

export const VSMART_ENTERPRISE_TEMPLATES: VsmartEnterpriseTemplate[] = [
  // ── CRM tickets (public API) ───────────────────────────────────
  {
    id: "ticket_created",
    title: "Ticket created",
    description:
      "Notify the customer when a CRM support ticket is opened. Wire as WA_STUDIO_TEMPLATE_CREATED.",
    useCase: "crm_tickets",
    badge: "CRM · Utility",
    form: base({
      name: "vsmart_ticket_created_v1",
      category: "Utility",
      header_format: "text",
      header_content: "Support ticket opened",
      body_text:
        "Hello {{1}},\n\nWe have opened support ticket *{{2}}* for you.\n\n*Summary:* {{3}}\n\nOur team will review this shortly and keep you updated on WhatsApp.\n\nReply to this chat if you have more details.",
      body_samples: [
        "Rajesh Kumar",
        "VS-1842",
        "CCTV offline at Gate 2",
      ],
      footer_text: FOOTER_UTILITY,
      buttons: [
        { type: "QUICK_REPLY", text: "Add details" },
        { type: "PHONE_NUMBER", text: "Call support", phone_number: PHONE },
      ],
    }),
  },
  {
    id: "ticket_status",
    title: "Ticket status update",
    description:
      "Status change from CRM (In progress, Waiting on parts, etc.). Wire as WA_STUDIO_TEMPLATE_STATUS.",
    useCase: "crm_tickets",
    badge: "CRM · Utility",
    form: base({
      name: "vsmart_ticket_status_v1",
      category: "Utility",
      header_format: "text",
      header_content: "Ticket update",
      body_text:
        "Hello {{1}},\n\nUpdate on ticket *{{2}}*:\n\n*Status:* {{3}}\n*Note:* {{4}}\n\nWe will continue until this is resolved. Reply here if you need anything else.",
      body_samples: [
        "Rajesh Kumar",
        "VS-1842",
        "In progress",
        "Engineer assigned — visit scheduled tomorrow",
      ],
      footer_text: FOOTER_UTILITY,
      buttons: [
        { type: "QUICK_REPLY", text: "Acknowledge" },
        { type: "QUICK_REPLY", text: "Need help" },
      ],
    }),
  },
  {
    id: "ticket_closed",
    title: "Ticket closed",
    description:
      "Resolution notice when CRM closes a ticket. Wire as WA_STUDIO_TEMPLATE_CLOSED.",
    useCase: "crm_tickets",
    badge: "CRM · Utility",
    form: base({
      name: "vsmart_ticket_closed_v1",
      category: "Utility",
      header_format: "text",
      header_content: "Ticket resolved",
      body_text:
        "Hello {{1}},\n\nTicket *{{2}}* has been marked *Resolved*.\n\n*Resolution:* {{3}}\n\nIf anything still needs attention, reply within 48 hours and we will reopen it.\n\nThank you for trusting Vsmart Technologies.",
      body_samples: [
        "Rajesh Kumar",
        "VS-1842",
        "Camera replaced and recording verified",
      ],
      footer_text: FOOTER_UTILITY,
      buttons: [
        { type: "QUICK_REPLY", text: "All good" },
        { type: "QUICK_REPLY", text: "Reopen" },
        { type: "URL", text: "Feedback", url: `${WEB}/contact` },
      ],
    }),
  },

  // ── Field service ──────────────────────────────────────────────
  {
    id: "service_update",
    title: "Service update",
    description:
      "General transactional update about a site service, AMC visit, or project milestone.",
    useCase: "field_service",
    badge: "Field · Utility",
    form: base({
      name: "vsmart_service_update_v1",
      category: "Utility",
      header_format: "text",
      header_content: "Service update",
      body_text:
        "Hello {{1}},\n\nThis is an update from Vsmart Technologies regarding *{{2}}*.\n\n{{3}}\n\nFor assistance, reply to this message or call us.",
      body_samples: [
        "Facilities Manager",
        "AMC visit — Site Chennai HQ",
        "Our engineer completed preventive checks on access control and CCTV. Report will follow by email.",
      ],
      footer_text: FOOTER_UTILITY,
      buttons: [
        { type: "URL", text: "Visit website", url: WEB },
        { type: "PHONE_NUMBER", text: "Call us", phone_number: PHONE },
      ],
    }),
  },
  {
    id: "site_visit",
    title: "Site visit confirmation",
    description:
      "Confirm engineer arrival window for installation, maintenance, or inspection.",
    useCase: "field_service",
    badge: "Field · Utility",
    form: base({
      name: "vsmart_site_visit_v1",
      category: "Utility",
      header_format: "text",
      header_content: "Site visit confirmed",
      body_text:
        "Hello {{1}},\n\nYour site visit is confirmed.\n\n*Site:* {{2}}\n*Date:* {{3}}\n*Window:* {{4}}\n*Engineer:* {{5}}\n\nPlease ensure access to the premises. Reply *RESCHEDULE* if you need a new slot.",
      body_samples: [
        "Priya N.",
        "Tech Park — Tower B",
        "12 Aug 2026",
        "10:00–13:00 IST",
        "Karthik (Vsmart)",
      ],
      footer_text: FOOTER_UTILITY,
      buttons: [
        { type: "QUICK_REPLY", text: "Confirm" },
        { type: "QUICK_REPLY", text: "Reschedule" },
        { type: "PHONE_NUMBER", text: "Call desk", phone_number: PHONE },
      ],
    }),
  },
  {
    id: "amc_reminder",
    title: "AMC / maintenance due",
    description:
      "Remind enterprise accounts that annual maintenance or service contract renewal is due.",
    useCase: "field_service",
    badge: "Field · Utility",
    form: base({
      name: "vsmart_amc_reminder_v1",
      category: "Utility",
      header_format: "text",
      header_content: "Maintenance reminder",
      body_text:
        "Hello {{1}},\n\nThis is a reminder that maintenance for *{{2}}* is due on *{{3}}*.\n\nContract / reference: {{4}}\n\nReply *BOOK* to schedule the visit, or call our service desk.",
      body_samples: [
        "Operations Head",
        "Electronic security systems — Warehouse",
        "20 Aug 2026",
        "AMC-2026-091",
      ],
      footer_text: FOOTER_UTILITY,
      buttons: [
        { type: "QUICK_REPLY", text: "Book visit" },
        { type: "QUICK_REPLY", text: "Call me" },
        { type: "URL", text: "Contact", url: `${WEB}/contact` },
      ],
    }),
  },
  {
    id: "appointment_reminder",
    title: "Appointment reminder",
    description:
      "Day-before reminder for discovery calls, demos, or on-site meetings.",
    useCase: "field_service",
    badge: "Field · Utility",
    form: base({
      name: "vsmart_appointment_reminder_v1",
      category: "Utility",
      header_format: "text",
      header_content: "Appointment reminder",
      body_text:
        "Hello {{1}},\n\nReminder: your appointment with Vsmart Technologies is scheduled for *{{2}}* at *{{3}}*.\n\n*Topic:* {{4}}\n\nReply *CONFIRM* or *RESCHEDULE*. We look forward to speaking with you.",
      body_samples: [
        "Ananya S.",
        "Tomorrow, 5 Aug",
        "11:30 IST",
        "Security systems discovery call",
      ],
      footer_text: FOOTER_UTILITY,
      buttons: [
        { type: "QUICK_REPLY", text: "Confirm" },
        { type: "QUICK_REPLY", text: "Reschedule" },
      ],
    }),
  },

  // ── Sales ──────────────────────────────────────────────────────
  {
    id: "quote_ready",
    title: "Quotation ready",
    description:
      "Notify a prospect that their commercial proposal / BOM quotation is ready.",
    useCase: "sales",
    badge: "Sales · Utility",
    form: base({
      name: "vsmart_quote_ready_v1",
      category: "Utility",
      header_format: "text",
      header_content: "Quotation ready",
      body_text:
        "Hello {{1}},\n\nYour quotation *{{2}}* is ready for review.\n\n*Project:* {{3}}\n*Valid until:* {{4}}\n\nOur team can walk you through the proposal on a short call. Reply here to schedule.",
      body_samples: [
        "Mr. Sharma",
        "QT-5521",
        "CCTV + access control — Corporate campus",
        "30 Aug 2026",
      ],
      footer_text: FOOTER_UTILITY,
      buttons: [
        { type: "QUICK_REPLY", text: "Schedule call" },
        { type: "URL", text: "Contact us", url: `${WEB}/contact` },
        { type: "PHONE_NUMBER", text: "Call sales", phone_number: PHONE },
      ],
    }),
  },
  {
    id: "lead_followup",
    title: "Enquiry follow-up",
    description:
      "Proactive follow-up after a web / exhibition enquiry. Marketing category — use for opted-in leads.",
    useCase: "sales",
    badge: "Sales · Marketing",
    form: base({
      name: "vsmart_lead_followup_v1",
      category: "Marketing",
      header_format: "text",
      header_content: "Vsmart Technologies",
      body_text:
        "Hello {{1}},\n\nThank you for your interest in *{{2}}*.\n\nVsmart Technologies delivers integrated security and smart-building solutions trusted across enterprise and government sites for 15 years.\n\n{{3}}\n\nWould you like a free discovery call this week?",
      body_samples: [
        "Deepak",
        "fire safety & emergency systems",
        "We can share a tailored site assessment checklist before the call.",
      ],
      footer_text: FOOTER_BRAND,
      buttons: [
        { type: "QUICK_REPLY", text: "Book a call" },
        { type: "QUICK_REPLY", text: "Send brochure" },
        { type: "URL", text: "Our solutions", url: `${WEB}` },
      ],
    }),
  },

  // ── Campaigns ──────────────────────────────────────────────────
  {
    id: "campaign_offer",
    title: "Campaign offer",
    description:
      "Marketing broadcast with quick replies + dynamic URL (use {{1}} path suffix for tracked CTAs via /r/ when template base is wa.vsmarttec.net/r/).",
    useCase: "campaigns",
    badge: "Campaign · Marketing",
    form: base({
      name: "vsmart_campaign_offer_v1",
      category: "Marketing",
      header_format: "text",
      header_content: "Vsmart Technologies",
      body_text:
        "Hello {{1}},\n\n{{2}}\n\nAs a valued partner, you are invited to explore *{{3}}* from Vsmart Technologies.\n\nReply STOP to opt out of marketing messages.",
      body_samples: [
        "Customer",
        "Upgrade season for electronic security is here.",
        "smart CCTV & access packages for multi-site estates",
      ],
      footer_text: FOOTER_BRAND,
      buttons: [
        { type: "QUICK_REPLY", text: "Interested" },
        { type: "QUICK_REPLY", text: "Call me" },
        {
          type: "URL",
          text: "Learn more",
          url: "https://wa.vsmarttec.net/r/{{1}}",
          example: "demo",
        },
      ],
    }),
  },
  {
    id: "reengage",
    title: "Re-engage dormant accounts",
    description:
      "Win-back message for inactive enterprise contacts. Marketing — respect opt-outs.",
    useCase: "campaigns",
    badge: "Campaign · Marketing",
    form: base({
      name: "vsmart_reengage_v1",
      category: "Marketing",
      header_format: "text",
      header_content: "We are here when you need us",
      body_text:
        "Hello {{1}},\n\nIt has been a while since we last connected on *{{2}}*.\n\nVsmart continues to support electronic security, fire safety, AV, and smart building automation across India.\n\nReply *UPDATE* if you would like a complimentary health check for your systems, or STOP to opt out.",
      body_samples: [
        "Facilities Lead",
        "access control at your Chennai facility",
      ],
      footer_text: FOOTER_BRAND,
      buttons: [
        { type: "QUICK_REPLY", text: "Update me" },
        { type: "QUICK_REPLY", text: "Not now" },
        { type: "PHONE_NUMBER", text: "Speak to us", phone_number: PHONE },
      ],
    }),
  },
];

export const VSMART_USE_CASE_LABELS: Record<VsmartTemplateUseCase, string> = {
  crm_tickets: "CRM tickets",
  field_service: "Field service",
  sales: "Sales",
  campaigns: "Campaigns",
};

export function getVsmartEnterpriseTemplate(
  id: string,
): VsmartEnterpriseTemplate | undefined {
  return VSMART_ENTERPRISE_TEMPLATES.find((t) => t.id === id);
}

/** Default form when opening “New template” with no pack selection. */
export const vsmartDefaultStarterForm: VsmartTemplateForm = {
  ...VSMART_ENTERPRISE_TEMPLATES.find((t) => t.id === "service_update")!.form,
};
