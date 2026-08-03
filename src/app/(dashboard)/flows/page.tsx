'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Workflow } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

type FlowRow = {
  id: string;
  name: string;
  status: string;
  trigger_type: string;
  entry_node_id: string | null;
  execution_count: number;
  last_executed_at: string | null;
};

/**
 * Minimal flows manager: create a keyword → menu → handoff starter
 * and activate it. Full canvas editor can replace this later.
 */
export default function FlowsPage() {
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('Welcome menu');
  const [keyword, setKeyword] = useState('hi');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('flows')
      .select(
        'id, name, status, trigger_type, entry_node_id, execution_count, last_executed_at',
      )
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) toast.error(error.message);
    else setFlows((data as FlowRow[]) ?? []);
    setLoading(false);
  }, [supabase, user?.id]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  async function createStarter() {
    if (!user?.id) return;
    setCreating(true);
    try {
      const { data: flow, error } = await supabase
        .from('flows')
        .insert({
          user_id: user.id,
          name: name.trim() || 'Welcome menu',
          status: 'draft',
          trigger_type: 'keyword',
          trigger_config: {
            keywords: [keyword.trim() || 'hi'],
            match_type: 'contains',
          },
          entry_node_id: 'start',
        })
        .select('id')
        .maybeSingle();
      if (error || !flow) throw new Error(error?.message || 'Create failed');

      const nodes = [
        {
          flow_id: flow.id,
          node_key: 'start',
          node_type: 'start',
          config: { next_node_key: 'menu' },
        },
        {
          flow_id: flow.id,
          node_key: 'menu',
          node_type: 'send_buttons',
          config: {
            body: 'Welcome to Vsmart Technologies. How can we help?',
            buttons: [
              { id: 'sales', title: 'Sales', next_node_key: 'sales_msg' },
              { id: 'support', title: 'Support', next_node_key: 'support_msg' },
              { id: 'agent', title: 'Talk to agent', next_node_key: 'handoff' },
            ],
          },
        },
        {
          flow_id: flow.id,
          node_key: 'sales_msg',
          node_type: 'send_message',
          config: {
            text: 'Thanks! Our sales team will follow up shortly.',
            next_node_key: 'end',
          },
        },
        {
          flow_id: flow.id,
          node_key: 'support_msg',
          node_type: 'send_message',
          config: {
            text: 'Got it — reply with your site / ticket details.',
            next_node_key: 'end',
          },
        },
        {
          flow_id: flow.id,
          node_key: 'handoff',
          node_type: 'handoff',
          config: {},
        },
        {
          flow_id: flow.id,
          node_key: 'end',
          node_type: 'end',
          config: {},
        },
      ];
      const { error: nErr } = await supabase.from('flow_nodes').insert(nodes);
      if (nErr) throw new Error(nErr.message);

      const { error: aErr } = await supabase
        .from('flows')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', flow.id);
      if (aErr) throw new Error(aErr.message);

      toast.success('Flow created and activated');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(id: string, status: 'active' | 'archived' | 'draft') {
    const { error } = await supabase
      .from('flows')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) toast.error(error.message);
    else await load();
  }

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Workflow className="h-6 w-6 text-primary" />
          Flows
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stateful WhatsApp chatbots (menus, collect input, handoff). Keyword
          starters run alongside Automations.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border p-4">
        <p className="text-sm font-medium">Create starter flow</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Keyword</Label>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
        </div>
        <Button
          type="button"
          disabled={creating}
          onClick={() => void createStarter()}
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Create &amp; activate
        </Button>
      </div>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : flows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No flows yet.</p>
      ) : (
        <ul className="space-y-2">
          {flows.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div>
                <p className="font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">
                  {f.trigger_type} · runs {f.execution_count ?? 0}
                  {f.last_executed_at
                    ? ` · last ${new Date(f.last_executed_at).toLocaleString()}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{f.status}</Badge>
                {f.status !== 'active' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(f.id, 'active')}
                  >
                    Activate
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(f.id, 'archived')}
                  >
                    Archive
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
