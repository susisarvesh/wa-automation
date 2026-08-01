'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import type { SettingsSection } from './settings-sections';
import { cn } from '@/lib/utils';

export function MvpSettingsOverview({
  onSelect,
}: {
  onSelect: (section: SettingsSection) => void;
}) {
  const { accountId, account } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase
      .from('whatsapp_config')
      .select('id, phone_number_id')
      .eq('account_id', accountId)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setConnected(Boolean(data?.phone_number_id));
      });
  }, [accountId]);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">{account?.name ?? 'My Business'}</CardTitle>
          <CardDescription>
            A few essentials. Everything else stays out of the way.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow
            done={connected === true}
            loading={connected === null}
            title="WhatsApp connected"
            action={
              <Link
                href="/connect"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                {connected ? 'Manage' : 'Connect'}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            }
          />
          <StatusRow
            done
            title="Business profile"
            action={
              <Button variant="ghost" size="sm" onClick={() => onSelect('business')}>
                Edit
              </Button>
            }
          />
          <StatusRow
            done
            title="Look & feel"
            action={
              <Button variant="ghost" size="sm" onClick={() => onSelect('appearance')}>
                Appearance
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({
  done,
  loading,
  title,
  action,
}: {
  done?: boolean;
  loading?: boolean;
  title: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card-2/40 px-4 py-3">
      <div className="flex items-center gap-3">
        {loading ? (
          <Circle className="h-5 w-5 animate-pulse text-muted-foreground" />
        ) : done ? (
          <CheckCircle2 className="h-5 w-5 text-primary" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{title}</span>
      </div>
      {action}
    </div>
  );
}
