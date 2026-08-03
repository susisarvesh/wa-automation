'use client';

import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useTheme } from '@/hooks/use-theme';
import { SettingsRail } from '@/components/settings/settings-rail';
import { MvpSettingsOverview } from '@/components/settings/mvp-settings-overview';
import { BusinessProfilePanel } from '@/components/settings/business-profile-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { ApiKeysPanel } from '@/components/settings/api-keys-panel';
import { WebhooksPanel } from '@/components/settings/webhooks-panel';
import {
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode } = useTheme();

  // Templates live at /templates now — bounce legacy Settings deep-links.
  useEffect(() => {
    if (searchParams.get('tab') !== 'templates') return;
    const qs = searchParams.get('new') === '1' ? '?new=1' : '';
    router.replace(`/templates${qs}`);
  }, [searchParams, router]);

  const section = resolveSection(searchParams.get('tab'));

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: mode.charAt(0).toUpperCase() + mode.slice(1),
    }),
    [mode],
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <MvpSettingsOverview onSelect={go} />,
    business: <BusinessProfilePanel />,
    appearance: <AppearancePanel />,
    whatsapp: <WhatsAppConfig />,
    'api-keys': <ApiKeysPanel />,
    webhooks: <WebhooksPanel />,
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Just the essentials for your business.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
        <SettingsRail active={section} onSelect={go} hints={hints} />
        <div className="min-w-0">{panel[section]}</div>
      </div>
    </div>
  );
}
