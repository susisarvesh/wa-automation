'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import {
  applyAnswersToTemplate,
  getTemplate,
  type AutomationTemplateDefinition,
  type TemplateQuestion,
} from '@/lib/automations/templates'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { WhatsAppPreview } from '@/components/automations/whatsapp-preview'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

function buildInitialAnswers(t: AutomationTemplateDefinition) {
  const init: Record<string, string> = {}
  for (const q of t.questions) {
    if (q.path.startsWith('steps.') && q.type === 'textarea') {
      const parts = q.path.split('.')
      const idx = Number(parts[1])
      const field = parts[3]
      const cfg = t.steps[idx]?.step_config as Record<string, unknown> | undefined
      if (cfg && typeof cfg[field] === 'string') init[q.id] = cfg[field] as string
    }
    if (q.type === 'keywords') {
      const key = q.path.replace('trigger_config.', '')
      const val = (t.trigger_config as Record<string, unknown>)[key]
      if (Array.isArray(val)) init[q.id] = val.join(', ')
    }
    if (q.type === 'select' && q.options?.[0]) {
      init[q.id] = q.options[0].value
    }
    if (q.id === 'hours') {
      init[q.id] = '18:00-09:00'
    }
  }
  return init
}

export default function AutomationSetupPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const { account } = useAuth()
  const template = useMemo(() => getTemplate(params.slug), [params.slug])
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const t = getTemplate(params.slug)
    return t ? buildInitialAnswers(t) : {}
  })
  const [publishing, setPublishing] = useState(false)
  const [doneId, setDoneId] = useState<string | null>(null)
  const [metaLive, setMetaLive] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/whatsapp/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => setMetaLive(Boolean(b.connected)))
      .catch(() => setMetaLive(false))
  }, [])

  const preview = useMemo(() => {
    if (!template) return ''
    const draft = applyAnswersToTemplate(template, answers)
    const firstMsg = draft.steps.find((s) => s.step_type === 'send_message')
    // Also check for message after a condition (flat seeds use parent_index)
    const anyMsg = draft.steps.find(
      (s) =>
        s.step_type === 'send_message' &&
        typeof (s.step_config as { text?: string }).text === 'string',
    )
    return (
      (firstMsg?.step_config as { text?: string } | undefined)?.text ??
      (anyMsg?.step_config as { text?: string } | undefined)?.text ??
      template.preview
    )
  }, [template, answers])

  if (!template) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Template not found</h1>
        <Link href="/automations" className={buttonVariants()}>
          Back to library
        </Link>
      </div>
    )
  }

  async function publish() {
    for (const q of template!.questions) {
      if (q.required && !answers[q.id]?.trim()) {
        toast.error(`Please fill in: ${q.label}`)
        return
      }
    }
    if (metaLive === false) {
      toast.error('Connect WhatsApp to Meta before publishing')
      router.push('/connect')
      return
    }
    setPublishing(true)
    try {
      const res = await fetch('/api/automations/publish-template', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: template!.slug, answers }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error ?? 'Could not publish')
      }
      setDoneId(body.automation?.id ?? 'ok')
      toast.success("You're live — Meta will send this message when it triggers")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish')
    } finally {
      setPublishing(false)
    }
  }

  if (doneId) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-10 text-center">
        <div className="vsmart-shape mx-auto flex h-16 w-16 items-center justify-center bg-brand-orange text-white">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            You&apos;re live
          </h1>
          <p className="text-muted-foreground">
            <strong>{template.name}</strong> will send via Meta Cloud API when
            it matches. Track sent / failed / replied on the Automations page.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {doneId !== 'ok' && (
            <Link
              href={`/automations/${doneId}/manage`}
              className={cn(buttonVariants({ size: 'lg' }), 'rounded-xl')}
            >
              Manage automation
            </Link>
          )}
          <Link
            href="/automations"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'rounded-xl',
            )}
          >
            All automations
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => router.push('/automations')}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Library
      </Button>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {template.category}
        </p>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {template.name}
        </h1>
        <p className="text-muted-foreground">{template.description}</p>
      </div>

      {metaLive === false && (
        <div className="vsmart-shape border border-brand-orange/30 bg-brand-orange-soft px-4 py-3 text-sm">
          Meta is not connected.{' '}
          <Link href="/connect" className="font-semibold text-primary underline">
            Connect WhatsApp
          </Link>{' '}
          so Publish can send for real.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="vsmart-shape border-border shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-lg">
              Personalize
            </CardTitle>
            <CardDescription>
              Answers update the WhatsApp preview on the right before you publish.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {template.questions.map((q) => (
              <QuestionField
                key={q.id}
                question={q}
                value={answers[q.id] ?? ''}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
              />
            ))}

            <Button
              size="lg"
              className="w-full rounded-xl"
              onClick={publish}
              disabled={publishing}
            >
              {publishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Publish to Meta
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">
            Exact WhatsApp message
          </p>
          <WhatsAppPreview
            text={preview}
            businessName={account?.name ?? 'Your business'}
            kind={template.previewKind ?? 'text'}
            header={template.previewHeader}
            footer={template.previewFooter}
            buttons={template.previewButtons}
            listRows={template.previewListRows}
          />
        </div>
      </div>
    </div>
  )
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: TemplateQuestion
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={question.id}>{question.label}</Label>
      {question.helper ? (
        <p className="text-xs text-muted-foreground">{question.helper}</p>
      ) : null}
      {question.type === 'textarea' ? (
        <Textarea
          id={question.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="rounded-xl"
        />
      ) : question.type === 'select' ? (
        <div className="flex flex-wrap gap-2">
          {question.options?.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={
                value === opt.value
                  ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
                  : 'rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <Input
          id={question.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          className="rounded-xl"
        />
      )}
    </div>
  )
}
