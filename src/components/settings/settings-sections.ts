import {
  LayoutGrid,
  Palette,
  PlugZap,
  Building2,
  FileText,
  type LucideIcon,
} from 'lucide-react';

/** Minimal settings for the business-owner MVP. */
export const SETTINGS_SECTIONS = [
  'overview',
  'business',
  'appearance',
  'whatsapp',
  'templates',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', label: 'Overview', icon: LayoutGrid, group: 'top' },
  business: { id: 'business', label: 'Business profile', icon: Building2, group: 'account' },
  appearance: { id: 'appearance', label: 'Appearance', icon: Palette, group: 'account' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace' },
  templates: { id: 'templates', label: 'Templates', icon: FileText, group: 'workspace' },
};

export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: null, group: 'top' },
  { label: 'Your business', group: 'account' },
  { label: 'Messaging', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

export function resolveSection(raw: string | null): SettingsSection {
  // Legacy tabs collapse onto the closest MVP section.
  if (raw === 'profile' || raw === 'security') return 'business';
  if (
    raw === 'quick-replies' ||
    raw === 'fields' ||
    raw === 'deals' ||
    raw === 'members' ||
    raw === 'api' ||
    raw === 'tags' ||
    raw === 'custom-fields'
  ) {
    return 'overview';
  }
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}
