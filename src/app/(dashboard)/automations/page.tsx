"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Zap,
  Clock,
  Loader2,
  Search,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { Automation } from "@/types"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AUTOMATION_TEMPLATES,
  TEMPLATE_LIBRARY_ORDER,
  type TemplateCategory,
  type TemplateSlug,
} from "@/lib/automations/templates"
import { cn } from "@/lib/utils"

const CATEGORIES: Array<TemplateCategory | "All"> = [
  "All",
  "Welcome",
  "Sales",
  "Support",
  "Reminders",
  "Engagement",
]

export default function AutomationsPage() {
  const router = useRouter()
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All")
  const [toggling, setToggling] = useState<string | null>(null)

  async function load() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) {
      toast.error(error.message)
      setAutomations([])
      return
    }
    setAutomations((data ?? []) as Automation[])
  }

  useEffect(() => {
    load()
  }, [])

  const library = useMemo(() => {
    return TEMPLATE_LIBRARY_ORDER.map((slug) => AUTOMATION_TEMPLATES[slug]).filter(
      (t) => {
        if (category !== "All" && t.category !== category) return false
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return (
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
        )
      },
    )
  }, [category, query])

  async function toggleActive(a: Automation, next: boolean) {
    setToggling(a.id)
    setAutomations(
      (prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ?? prev,
    )
    const res = await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    })
    if (!res.ok) {
      toast.error("Could not update automation")
      await load()
    }
    setToggling(null)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">Automations</p>
        <h1 className="text-3xl font-bold tracking-tight">Pick a template</h1>
        <p className="max-w-2xl text-muted-foreground">
          Choose what you need. Answer a couple of questions. Press Publish.
          No builders, no technical steps.
        </p>
      </div>

      {automations && automations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Live now
          </h2>
          <div className="grid gap-2">
            {automations.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.is_active ? "Live" : "Paused"} · {a.description ?? "Automation"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={toggling === a.id}
                  onClick={() => toggleActive(a, !a.is_active)}
                  className="shrink-0"
                >
                  {a.is_active ? (
                    <ToggleRight className="h-5 w-5 text-primary" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search automations…"
              className="rounded-xl pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  category === c
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {library.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => router.push(`/automations/setup/${t.slug}`)}
              className="group flex flex-col rounded-2xl border border-border/80 bg-card p-5 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {t.category}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  {t.popularity}% love it
                </span>
              </div>
              <h3 className="text-base font-semibold group-hover:text-primary">
                {t.name}
              </h3>
              <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">
                {t.description}
              </p>
              <p className="mt-3 line-clamp-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-foreground/80 italic">
                “{t.preview}”
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />~{t.estimatedMinutes} min
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-primary">
                  <Zap className="h-3.5 w-3.5" />
                  Use template
                </span>
              </div>
            </button>
          ))}
        </div>

        {library.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-muted-foreground">
            <Loader2 className="mb-2 h-5 w-5 opacity-0" />
            No templates match your search.
          </div>
        )}
      </section>

      <div className="text-center">
        <Link href="/home" className={buttonVariants({ variant: "link" })}>
          Back to home
        </Link>
      </div>
    </div>
  )
}
