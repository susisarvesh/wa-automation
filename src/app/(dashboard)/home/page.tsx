'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, MessageSquare, Sparkles, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">WhatsApp Studio</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {account?.name ? `Welcome, ${account.name}` : 'Welcome'}
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Connect WhatsApp, pick a ready-made automation, and go live in minutes.
          No technical setup.
        </p>
      </div>

      {connected === false && (
        <Card className="overflow-hidden rounded-3xl border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <MessageSquare className="h-6 w-6 text-primary" />
              Connect WhatsApp
            </CardTitle>
            <CardDescription className="text-base">
              One quick step so you can message customers automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/connect"
              className={cn(buttonVariants({ size: 'lg' }), 'rounded-xl')}
            >
              Connect now
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      )}

      {connected === true && (
        <Card className="rounded-3xl border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              WhatsApp is connected
            </CardTitle>
            <CardDescription className="text-base">
              Start an automation — pick a template and answer a few questions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/automations"
              className={cn(buttonVariants({ size: 'lg' }), 'rounded-xl')}
            >
              Browse automations
              <Zap className="ml-2 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Popular automations</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {popular.map((t) => (
            <Link
              key={t.slug}
              href={`/automations/setup/${t.slug}`}
              className="group rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <p className="text-sm font-semibold text-foreground group-hover:text-primary">
                {t.name}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {t.description}
              </p>
              <p className="mt-3 text-xs text-primary">
                ~{t.estimatedMinutes} min · Set up
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
