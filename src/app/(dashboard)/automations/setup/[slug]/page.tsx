'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
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
  const template = useMemo(() => getTemplate(params.slug), [params.slug])
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const t = getTemplate(params.slug)
    return t ? buildInitialAnswers(t) : {}
  })
  const [publishing, setPublishing] = useState(false)
  const [doneId, setDoneId] = useState<string | null>(null)

  const preview = useMemo(() => {
    if (!template) return ''
    const draft = applyAnswersToTemplate(template, answers)
    const firstMsg = draft.steps.find((s) => s.step_type === 'send_message')
    return (
      (firstMsg?.step_config as { text?: string } | undefined)?.text ??
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
      toast.success("You're live!")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish')
    } finally {
      setPublishing(false)
    }
  }

  if (doneId) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">You&apos;re live</h1>
          <p className="text-muted-foreground">
            <strong>{template.name}</strong> is running. New matching messages will
            get your reply automatically.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/inbox"
            className={cn(buttonVariants({ size: 'lg' }), 'rounded-xl')}
          >
            Open inbox
          </Link>
          <Link
            href="/automations"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'rounded-xl',
            )}
          >
            More automations
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
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
        <p className="text-sm font-medium text-primary">{template.category}</p>
        <h1 className="text-3xl font-bold tracking-tight">{template.name}</h1>
        <p className="text-muted-foreground">{template.description}</p>
      </div>

      <Card className="rounded-3xl border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">A few quick questions</CardTitle>
          <CardDescription>
            Only what we need to personalize this automation.
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

          <div className="rounded-2xl bg-muted/50 p-4">
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Preview
            </p>
            <p className="text-sm whitespace-pre-wrap">{preview}</p>
          </div>

          <Button
            size="lg"
            className="w-full rounded-xl"
            onClick={publish}
            disabled={publishing}
          >
            {publishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Publish
          </Button>
        </CardContent>
      </Card>
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
