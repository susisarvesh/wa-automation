'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  AccessLockedPanel,
  AccessWaitingBanner,
} from '@/components/auth/access-locked';
import { TemplateCatalog } from '@/components/templates';

export default function TemplatesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TemplatesPageInner />
    </Suspense>
  );
}

function TemplatesPageInner() {
  const { isAccessApproved, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAccessApproved) {
    return (
      <div className="space-y-4">
        <AccessWaitingBanner />
        <AccessLockedPanel title="Templates are locked" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <TemplateCatalog />
    </div>
  );
}
