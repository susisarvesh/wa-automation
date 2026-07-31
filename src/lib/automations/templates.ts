import type {
  AutomationStepConfig,
  AutomationStepType,
  AutomationTriggerConfig,
  AutomationTriggerType,
} from '@/types'

export type TemplateSlug =
  | 'welcome_message'
  | 'out_of_office'
  | 'lead_qualifier'
  | 'follow_up_reminder'
  | 'appointment_reminder'
  | 'payment_reminder'
  | 'birthday_wishes'
  | 'order_confirmation'
  | 'feedback_collection'
  | 'support_faq'
  | 'sales_follow_up'
  | 'reengage_customers'
  | 'collect_reviews'
  | 'missed_call_followup'
  | 'delivery_updates'
  | 'event_reminder'

export type TemplateCategory =
  | 'Welcome'
  | 'Sales'
  | 'Support'
  | 'Reminders'
  | 'Engagement'

export type QuestionType = 'text' | 'textarea' | 'select' | 'keywords'

export interface TemplateQuestion {
  id: string
  label: string
  helper?: string
  type: QuestionType
  /** Dot path into the draft used when publishing, e.g. steps.0.step_config.text */
  path: string
  options?: { label: string; value: string }[]
  placeholder?: string
  required?: boolean
}

export interface TemplateStepSeed {
  step_type: AutomationStepType
  step_config: AutomationStepConfig
  branch?: 'yes' | 'no' | null
  parent_index?: number | null
}

export interface AutomationTemplateDefinition {
  slug: TemplateSlug
  name: string
  description: string
  category: TemplateCategory
  estimatedMinutes: number
  popularity: number
  preview: string
  trigger_type: AutomationTriggerType
  trigger_config: AutomationTriggerConfig
  steps: TemplateStepSeed[]
  questions: TemplateQuestion[]
  /** When true, publish auto-creates/attaches the Customer tag for add_tag steps. */
  needsCustomerTag?: boolean
}

function msg(
  text: string,
  extras: Partial<TemplateStepSeed> = {},
): TemplateStepSeed {
  return { step_type: 'send_message', step_config: { text }, ...extras }
}

export const AUTOMATION_TEMPLATES: Record<
  TemplateSlug,
  AutomationTemplateDefinition
> = {
  welcome_message: {
    slug: 'welcome_message',
    name: 'Welcome New Customer',
    description: 'Greet first-time messagers instantly with a warm hello.',
    category: 'Welcome',
    estimatedMinutes: 2,
    popularity: 98,
    preview: "Hi! Thanks for reaching out. We'll get back to you shortly.",
    trigger_type: 'first_inbound_message',
    trigger_config: {},
    needsCustomerTag: true,
    questions: [
      {
        id: 'audience',
        label: 'What should we call your customers?',
        type: 'select',
        path: 'meta.audience',
        options: [
          { label: 'Customers', value: 'customers' },
          { label: 'Clients', value: 'clients' },
          { label: 'Patients', value: 'patients' },
          { label: 'Students', value: 'students' },
          { label: 'Visitors', value: 'visitors' },
        ],
      },
      {
        id: 'message',
        label: 'What message should they receive?',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg("Hi! 👋 Thanks for reaching out. We'll get back to you shortly."),
      { step_type: 'add_tag', step_config: { tag_id: '' } },
    ],
  },
  missed_call_followup: {
    slug: 'missed_call_followup',
    name: 'Missed Call Follow-up',
    description: 'When someone messages after a missed call, reply right away.',
    category: 'Sales',
    estimatedMinutes: 2,
    popularity: 86,
    preview: "Sorry we missed you! How can we help?",
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['missed', 'called', 'call back'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'keywords',
        label: 'Words that should trigger this (comma-separated)',
        type: 'keywords',
        path: 'trigger_config.keywords',
        placeholder: 'missed, called, call back',
      },
      {
        id: 'message',
        label: 'Reply message',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        "Sorry we missed your call! Reply here and we'll get back to you as soon as we can.",
      ),
    ],
  },
  lead_qualifier: {
    slug: 'lead_qualifier',
    name: 'Lead Qualification',
    description: 'Ask a quick question when someone mentions pricing or buying.',
    category: 'Sales',
    estimatedMinutes: 3,
    popularity: 91,
    preview: 'Happy to help with pricing! Quick question…',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['pricing', 'quote', 'buy', 'cost'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'keywords',
        label: 'Trigger words (comma-separated)',
        type: 'keywords',
        path: 'trigger_config.keywords',
      },
      {
        id: 'message',
        label: 'Qualification question',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        "Great — happy to help! Quick question: what are you looking for, and what's your timeline?",
      ),
      { step_type: 'wait', step_config: { amount: 10, unit: 'minutes' } },
      {
        step_type: 'assign_conversation',
        step_config: { mode: 'round_robin' },
      },
    ],
  },
  appointment_reminder: {
    slug: 'appointment_reminder',
    name: 'Appointment Reminder',
    description: 'Confirm appointments when customers message about booking.',
    category: 'Reminders',
    estimatedMinutes: 2,
    popularity: 88,
    preview: 'Just a reminder about your upcoming appointment…',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['appointment', 'booking', 'schedule'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'message',
        label: 'Reminder message',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        "Thanks! We've noted your appointment request. Reply with your preferred day and time and we'll confirm.",
      ),
    ],
  },
  payment_reminder: {
    slug: 'payment_reminder',
    name: 'Payment Reminder',
    description: 'Gentle nudge when customers ask about invoices or payments.',
    category: 'Reminders',
    estimatedMinutes: 2,
    popularity: 80,
    preview: 'Friendly reminder that your payment is due…',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['invoice', 'payment', 'pay', 'bill'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'message',
        label: 'Payment message',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        'Happy to help with payment. Share your invoice number and we will send the details right away.',
      ),
    ],
  },
  birthday_wishes: {
    slug: 'birthday_wishes',
    name: 'Birthday Wishes',
    description: 'Celebrate customers who mention a birthday.',
    category: 'Engagement',
    estimatedMinutes: 2,
    popularity: 72,
    preview: 'Happy birthday! Here is a little gift…',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['birthday', 'bday', 'born'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'message',
        label: 'Birthday message',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        'Happy birthday! 🎉 Wishing you a wonderful day — thank you for being with us.',
      ),
    ],
  },
  order_confirmation: {
    slug: 'order_confirmation',
    name: 'Order Confirmation',
    description: 'Confirm orders when customers say they want to buy.',
    category: 'Sales',
    estimatedMinutes: 2,
    popularity: 84,
    preview: 'Order received! We are preparing it now.',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['order', 'ordered', 'purchase'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'message',
        label: 'Confirmation message',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        "Thanks for your order! We've received it and will share updates shortly.",
      ),
    ],
  },
  delivery_updates: {
    slug: 'delivery_updates',
    name: 'Delivery Updates',
    description: 'Reply when customers ask where their order is.',
    category: 'Support',
    estimatedMinutes: 2,
    popularity: 79,
    preview: 'Your order is on the way…',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['delivery', 'shipping', 'track', 'where is'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'message',
        label: 'Delivery reply',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        "We can help track that. Please share your order number and we'll look it up right away.",
      ),
    ],
  },
  feedback_collection: {
    slug: 'feedback_collection',
    name: 'Feedback Collection',
    description: 'Ask for feedback after a conversation winds down.',
    category: 'Engagement',
    estimatedMinutes: 2,
    popularity: 77,
    preview: 'How did we do? Reply with 1–5 stars.',
    trigger_type: 'new_message_received',
    trigger_config: {},
    questions: [
      {
        id: 'message',
        label: 'Feedback ask',
        type: 'textarea',
        path: 'steps.1.step_config.text',
        required: true,
      },
    ],
    steps: [
      { step_type: 'wait', step_config: { amount: 1, unit: 'hours' } },
      msg('Quick check-in — how was your experience with us? Reply with 1–5 stars.'),
    ],
  },
  support_faq: {
    slug: 'support_faq',
    name: 'FAQ Auto Reply',
    description: 'Answer common support questions with a helpful blurb.',
    category: 'Support',
    estimatedMinutes: 2,
    popularity: 90,
    preview: 'Here are quick answers to common questions…',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['help', 'support', 'hours', 'location', 'faq'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'keywords',
        label: 'Trigger words',
        type: 'keywords',
        path: 'trigger_config.keywords',
      },
      {
        id: 'message',
        label: 'FAQ reply',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        "Happy to help! Share what you need and we'll point you in the right direction. For hours, location, or pricing — just ask.",
      ),
    ],
  },
  out_of_office: {
    slug: 'out_of_office',
    name: 'Out of Office',
    description: 'Auto-reply after hours so nobody is left waiting.',
    category: 'Support',
    estimatedMinutes: 2,
    popularity: 93,
    preview: 'Thanks for your message! Our team is offline right now…',
    trigger_type: 'new_message_received',
    trigger_config: {},
    questions: [
      {
        id: 'hours',
        label: 'After-hours window (e.g. 18:00-09:00)',
        type: 'text',
        path: 'steps.0.step_config.operand',
        placeholder: '18:00-09:00',
      },
      {
        id: 'message',
        label: 'Out-of-office message',
        type: 'textarea',
        path: 'steps.1.step_config.text',
        required: true,
      },
    ],
    steps: [
      {
        step_type: 'condition',
        step_config: {
          subject: 'time_of_day',
          operand: '18:00-09:00',
        },
      },
      msg(
        "Thanks for your message! Our team is offline right now and will reply when we're back.",
        { parent_index: 0, branch: 'yes' },
      ),
    ],
  },
  sales_follow_up: {
    slug: 'sales_follow_up',
    name: 'Sales Follow-up',
    description: 'Nudge warm leads who mentioned interest but went quiet.',
    category: 'Sales',
    estimatedMinutes: 2,
    popularity: 85,
    preview: 'Just circling back — still interested?',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['interested', 'demo', 'trial'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'message',
        label: 'Follow-up message',
        type: 'textarea',
        path: 'steps.1.step_config.text',
        required: true,
      },
    ],
    steps: [
      { step_type: 'wait', step_config: { amount: 1, unit: 'days' } },
      msg(
        'Just circling back — still interested? Happy to answer any questions.',
      ),
    ],
  },
  reengage_customers: {
    slug: 'reengage_customers',
    name: 'Re-engage Old Customers',
    description: 'Win back people who say they have not heard from you.',
    category: 'Engagement',
    estimatedMinutes: 2,
    popularity: 70,
    preview: 'We miss you! Here is what is new…',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['long time', 'miss you', 'come back'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'message',
        label: 'Re-engagement message',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        "It's great to hear from you again! Tell us what you need and we'll take care of it.",
      ),
    ],
  },
  collect_reviews: {
    slug: 'collect_reviews',
    name: 'Collect Reviews',
    description: 'Ask happy customers for a quick review.',
    category: 'Engagement',
    estimatedMinutes: 2,
    popularity: 81,
    preview: 'Loving the service? Leave us a quick review…',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['thanks', 'thank you', 'great', 'awesome'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'message',
        label: 'Review ask',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        'So glad you had a good experience! If you have 30 seconds, a short review would mean a lot.',
      ),
    ],
  },
  follow_up_reminder: {
    slug: 'follow_up_reminder',
    name: 'Follow-up Reminder',
    description: 'Send a nudge if someone has not replied within a day.',
    category: 'Reminders',
    estimatedMinutes: 2,
    popularity: 82,
    preview: 'Just checking in — any other questions?',
    trigger_type: 'new_message_received',
    trigger_config: {},
    questions: [
      {
        id: 'message',
        label: 'Nudge message',
        type: 'textarea',
        path: 'steps.1.step_config.text',
        required: true,
      },
    ],
    steps: [
      { step_type: 'wait', step_config: { amount: 1, unit: 'days' } },
      msg(
        'Just circling back — did you have any other questions? Happy to help!',
      ),
    ],
  },
  event_reminder: {
    slug: 'event_reminder',
    name: 'Event Reminder',
    description: 'Confirm event details when someone asks about an event.',
    category: 'Reminders',
    estimatedMinutes: 2,
    popularity: 68,
    preview: 'Looking forward to seeing you at the event…',
    trigger_type: 'keyword_match',
    trigger_config: {
      keywords: ['event', 'webinar', 'workshop', 'rsvp'],
      match_type: 'contains',
    },
    questions: [
      {
        id: 'message',
        label: 'Event message',
        type: 'textarea',
        path: 'steps.0.step_config.text',
        required: true,
      },
    ],
    steps: [
      msg(
        "Thanks for your interest! Reply with the event name and we'll send the details.",
      ),
    ],
  },
}

export const TEMPLATE_LIBRARY_ORDER: TemplateSlug[] = [
  'welcome_message',
  'out_of_office',
  'lead_qualifier',
  'appointment_reminder',
  'support_faq',
  'sales_follow_up',
  'payment_reminder',
  'order_confirmation',
  'collect_reviews',
  'missed_call_followup',
  'follow_up_reminder',
  'feedback_collection',
  'delivery_updates',
  'birthday_wishes',
  'reengage_customers',
  'event_reminder',
]

export function getTemplate(slug: string): AutomationTemplateDefinition | null {
  return AUTOMATION_TEMPLATES[slug as TemplateSlug] ?? null
}

/** Apply question answers onto a deep-cloned template draft. */
export function applyAnswersToTemplate(
  template: AutomationTemplateDefinition,
  answers: Record<string, string>,
): {
  name: string
  description: string
  trigger_type: AutomationTriggerType
  trigger_config: AutomationTriggerConfig
  steps: TemplateStepSeed[]
} {
  const steps = structuredClone(template.steps)
  const trigger_config = structuredClone(template.trigger_config) as Record<
    string,
    unknown
  >

  for (const q of template.questions) {
    const raw = answers[q.id]
    if (raw == null || raw === '') continue

    if (q.path.startsWith('trigger_config.')) {
      const key = q.path.slice('trigger_config.'.length)
      if (q.type === 'keywords') {
        trigger_config[key] = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      } else {
        trigger_config[key] = raw
      }
      continue
    }

    if (q.path.startsWith('steps.')) {
      const parts = q.path.split('.')
      // steps.N.step_config.field
      const idx = Number(parts[1])
      const field = parts.slice(3).join('.')
      if (!Number.isFinite(idx) || !steps[idx]) continue
      const cfg = steps[idx].step_config as Record<string, unknown>
      if (field.includes('.')) {
        // nested — not needed for MVP
        cfg[field] = raw
      } else {
        cfg[field] = raw
      }
    }
  }

  // Soft personalization for welcome audience word
  const audience = answers.audience
  if (audience && steps[0]?.step_type === 'send_message') {
    const text = String(
      (steps[0].step_config as { text?: string }).text ?? '',
    )
    if (!answers.message) {
      ;(steps[0].step_config as { text: string }).text = text.replace(
        /customers/gi,
        audience,
      )
    }
  }

  return {
    name: template.name,
    description: template.description,
    trigger_type: template.trigger_type,
    trigger_config: trigger_config as AutomationTriggerConfig,
    steps,
  }
}
