import type {
  MessageTemplate,
  TemplateButton,
  TemplateSampleValues,
} from '@/types';
import type { TemplatePayload } from '@/lib/whatsapp/template-validators';
import { vsmartDefaultStarterForm } from '@/lib/whatsapp/vsmart-enterprise-templates';

export type HeaderFormat = 'none' | 'text' | 'image' | 'video' | 'document';

export const HEADER_FORMATS: HeaderFormat[] = [
  'none',
  'text',
  'image',
  'video',
  'document',
];

export const CATEGORIES = ['Marketing', 'Utility'] as const;

export const COMMON_LANGUAGE_CODES = [
  'en_US',
  'en',
  'en_GB',
  'hi',
  'ta',
  'es',
  'es_ES',
  'es_MX',
  'fr',
  'fr_FR',
  'de',
  'pt_BR',
  'pt_PT',
  'ar',
];

export interface TemplateFormData {
  name: string;
  category: MessageTemplate['category'];
  language: string;
  header_format: HeaderFormat;
  header_content: string;
  header_media_url: string;
  header_sample: string;
  body_text: string;
  body_samples: string[];
  footer_text: string;
  buttons: TemplateButton[];
}

export const emptyTemplateForm: TemplateFormData = {
  name: '',
  category: 'Marketing',
  language: 'en_US',
  header_format: 'none',
  header_content: '',
  header_media_url: '',
  header_sample: '',
  body_text: '',
  body_samples: [],
  footer_text: '',
  buttons: [],
};

/** Brand-aligned starter for new templates (enterprise pack). */
export const vsmartStarterTemplateForm: TemplateFormData = {
  ...vsmartDefaultStarterForm,
};

export function emptyButton(type: TemplateButton['type']): TemplateButton {
  switch (type) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: '' };
    case 'URL':
      return { type: 'URL', text: '', url: '' };
    case 'PHONE_NUMBER':
      return { type: 'PHONE_NUMBER', text: '', phone_number: '' };
    case 'COPY_CODE':
      return { type: 'COPY_CODE', text: 'Copy code', example: '' };
  }
}

export function formFromTemplate(template: MessageTemplate): TemplateFormData {
  return {
    name: template.name,
    category: template.category,
    language: template.language || 'en_US',
    header_format: (template.header_type ?? 'none') as HeaderFormat,
    header_content: template.header_content ?? '',
    header_media_url: template.header_media_url ?? '',
    header_sample: template.sample_values?.header?.[0] ?? '',
    body_text: template.body_text,
    body_samples: template.sample_values?.body ?? [],
    footer_text: template.footer_text ?? '',
    buttons: template.buttons ?? [],
  };
}

export function buildSubmitPayload(form: TemplateFormData): TemplatePayload {
  const sample_values: TemplateSampleValues = {};
  if (form.body_samples.some((v) => v.trim())) {
    sample_values.body = form.body_samples.map((v) => v.trim());
  }
  if (form.header_format === 'text' && form.header_sample.trim()) {
    sample_values.header = [form.header_sample.trim()];
  }

  return {
    name: form.name.trim(),
    category: form.category,
    language: form.language.trim() || 'en_US',
    header_type: form.header_format === 'none' ? undefined : form.header_format,
    header_content:
      form.header_format === 'text' ? form.header_content.trim() : undefined,
    header_media_url:
      form.header_format !== 'none' && form.header_format !== 'text'
        ? form.header_media_url.trim() || undefined
        : undefined,
    body_text: form.body_text.trim(),
    footer_text: form.footer_text.trim() || undefined,
    buttons: form.buttons.length > 0 ? form.buttons : undefined,
    sample_values:
      Object.keys(sample_values).length > 0 ? sample_values : undefined,
  };
}

export function fillTemplateVars(
  text: string,
  samples: string[] | undefined,
): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const idx = Number(n) - 1;
    const sample = samples?.[idx]?.trim();
    return sample || `{{${n}}}`;
  });
}
