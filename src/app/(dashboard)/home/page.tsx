'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, CheckCircle2, MessageSquare, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { buttonVariants } from '@/components/ui/button';
import {
  AUTOMATION_TEMPLATES,
  TEMPLATE_LIBRARY_ORDER,
} from '@/lib/automations/templates';
import { cn } from '@/lib/utils';

export default function HomePage() {
  const { accountId, account } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase
      .from('whatsapp_config')
      .select('phone_number_id')
      .eq('account_id', accountId)
      .maybeSingle()
      .then(({ data }) => setConnected(Boolean(data?.phone_number_id)));
  }, [accountId]);

  const popular = TEMPLATE_LIBRARY_ORDER.slice(0, 3).map(
    (slug) => AUTOMATION_TEMPLATES[slug],
  );

  return (
    <div className="vsmart-mesh -m-4 min-h-full space-y-8 p-4 sm:-m-6 sm:p-6">
      <section className="mx-auto max-w-3xl pt-2">
        <div className="mb-6 flex items-center gap-3">
          <Image
            src="/brand/vsmart-mark.png"
            alt="Vsmart"
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
            priority
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Vsmart Technologies
            </p>
            <p className="text-sm text-muted-foreground">Taking future ahead</p>
          </div>
        </div>

        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {account?.name ? `Hello, ${account.name}` : 'WhatsApp, simplified'}
        </h1>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          Connect your number, pick an automation, and start messaging customers.
          Three steps — no clutter.
        </p>

        <ol className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            { n: '01', label: 'Connect WhatsApp' },
            { n: '02', label: 'Pick an automation' },
            { n: '03', label: 'Reply in Inbox' },
          ].map((step) => (
            <li
              key={step.n}
              className="vsmart-shape border border-border bg-card px-4 py-3 shadow-sm"
            >
              <span className="text-xs font-semibold text-brand-orange">{step.n}</span>
              <p className="mt-1 text-sm font-medium text-foreground">{step.label}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-3xl">
        {connected === false && (
          <div className="vsmart-shape border border-primary/20 bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-xl font-semibold text-foreground">
                  Connect WhatsApp
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Link your Business number so automations can send messages.
                </p>
                <Link
                  href="/connect"
                  className={cn(
                    buttonVariants({ size: 'lg' }),
                    'mt-5 rounded-xl bg-primary hover:bg-primary-hover',
                  )}
                >
                  Connect now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {connected === true && (
          <div className="vsmart-shape border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-orange-soft text-brand-orange">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-xl font-semibold text-foreground">
                  WhatsApp is connected
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a ready-made automation and go live in a few minutes.
                </p>
                <Link
                  href="/automations"
                  className={cn(
                    buttonVariants({ size: 'lg' }),
                    'mt-5 rounded-xl bg-primary hover:bg-primary-hover',
                  )}
                >
                  Browse automations
                  <Zap className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-3xl space-y-3 pb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Popular automations
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {popular.map((t) => (
            <Link
              key={t.slug}
              href={`/automations/setup/${t.slug}`}
              className="vsmart-shape group border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <p className="text-sm font-semibold text-foreground group-hover:text-primary">
                {t.name}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {t.description}
              </p>
              <p className="mt-3 text-xs font-medium text-brand-orange">
                ~{t.estimatedMinutes} min · Set up
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
