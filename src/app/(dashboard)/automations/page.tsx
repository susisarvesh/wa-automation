"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Zap,
  Clock,
  Loader2,
  Search,
  Sparkles,
  Pause,
  Play,
  Pencil,
  Copy,
  Radio,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { Automation } from "@/types"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AUTOMATION_TEMPLATES,
  TEMPLATE_LIBRARY_ORDER,
  type TemplateCategory,
} from "@/lib/automations/templates"
import { cn } from "@/lib/utils"

type AutomationStats = {
  runs: number
  sent: number
  failed: number
  replied: number
}

const CATEGORIES: Array<TemplateCategory | "All"> = [
  "All",
  "Welcome",
  "Sales",
  "Support",
  "Reminders",
  "Engagement",
]

const emptyStats = (): AutomationStats => ({
  runs: 0,
  sent: 0,
  failed: 0,
  replied: 0,
})

export default function AutomationsPage() {
  const router = useRouter()
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  const [stats, setStats] = useState<Record<string, AutomationStats>>({})
  const [statsLive, setStatsLive] = useState(false)
  const [metaLive, setMetaLive] = useState<boolean | null>(null)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All")
  const [busyId, setBusyId] = useState<string | null>(null)
  const loadStatsRef = useRef<() => Promise<void>>(async () => {})

  const loadAutomations = useCallback(async () => {
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
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/automations/stats", { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.stats) setStats(body.stats)
    } catch {
      // non-fatal
    }
  }, [])

  loadStatsRef.current = loadStats

  useEffect(() => {
    loadAutomations()
    loadStats()
    fetch("/api/whatsapp/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setMetaLive(Boolean(b.connected)))
      .catch(() => setMetaLive(false))
  }, [loadAutomations, loadStats])

  // Realtime: refresh stats when automation_logs or automations change.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("automations-delivery-stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automation_logs" },
        () => {
          void loadStatsRef.current()
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automations" },
        () => {
          void loadAutomations()
          void loadStatsRef.current()
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          void loadStatsRef.current()
        },
      )
      .subscribe((status) => {
        setStatsLive(status === "SUBSCRIBED")
      })

    const onVis = () => {
      if (document.visibilityState === "visible") void loadStatsRef.current()
    }
    document.addEventListener("visibilitychange", onVis)

    return () => {
      document.removeEventListener("visibilitychange", onVis)
      void supabase.removeChannel(channel)
    }
  }, [loadAutomations])

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
    if (next && metaLive === false) {
      toast.error("Connect WhatsApp to Meta before going live")
      router.push("/connect")
      return
    }
    setBusyId(a.id)
    setAutomations(
      (prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ??
        prev,
    )
    const res = await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    })
    if (!res.ok) {
      toast.error("Could not update automation")
      await loadAutomations()
    } else {
      toast.success(next ? "Live" : "Paused")
    }
    setBusyId(null)
  }

  async function duplicate(a: Automation) {
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/automations/${a.id}/duplicate`, {
        method: "POST",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Duplicate failed")
      toast.success("Paused copy created")
      await loadAutomations()
      router.push(`/automations/${body.automation.id}/manage`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Automations
          </p>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Pick a template
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Preview the WhatsApp message, publish, then pause / edit / duplicate
            without a builder.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
              metaLive
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                metaLive ? "bg-brand-orange" : "bg-muted-foreground",
              )}
            />
            {metaLive === null
              ? "Checking Meta…"
              : metaLive
                ? "Meta connected"
                : "Meta not connected"}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Radio
              className={cn("h-3 w-3", statsLive && "text-brand-orange")}
            />
            {statsLive ? "Live stats" : "Stats polling"}
          </span>
        </div>
      </div>

      {metaLive === false && (
        <div className="vsmart-shape flex flex-wrap items-center justify-between gap-3 border border-brand-orange/30 bg-brand-orange-soft px-4 py-3 text-sm">
          <p className="text-foreground">
            Connect WhatsApp to Meta so published automations can actually send.
          </p>
          <Link
            href="/connect"
            className={cn(buttonVariants({ size: "sm" }), "rounded-xl")}
          >
            Connect Meta
          </Link>
        </div>
      )}

      {automations && automations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your automations
          </h2>
          <div className="grid gap-3">
            {automations.map((a) => {
              const s = stats[a.id] ?? emptyStats()
              return (
                <div
                  key={a.id}
                  className="vsmart-shape border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-heading font-semibold">
                          {a.name}
                        </p>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                            a.is_active
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {a.is_active ? "Live" : "Paused"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {a.description ?? "Automation"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        disabled={busyId === a.id}
                        onClick={() => toggleActive(a, !a.is_active)}
                      >
                        {a.is_active ? (
                          <>
                            <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                          </>
                        ) : (
                          <>
                            <Play className="mr-1 h-3.5 w-3.5" /> Go live
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => router.push(`/automations/${a.id}/manage`)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-lg"
                        disabled={busyId === a.id}
                        onClick={() => duplicate(a)}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" /> Duplicate
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {(
                      [
                        ["Sent", s.sent],
                        ["Failed", s.failed],
                        ["Replied", s.replied],
                        ["Runs", s.runs],
                      ] as const
                    ).map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl bg-muted/60 px-2 py-2 text-center"
                      >
                        <p className="font-heading text-lg font-semibold tabular-nums text-foreground">
                          {value}
                        </p>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
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
              className="vsmart-shape group flex flex-col border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {t.category}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-brand-orange">
                  <Sparkles className="h-3 w-3" />
                  {t.popularity}%
                </span>
              </div>
              <h3 className="font-heading text-base font-semibold group-hover:text-primary">
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
    </div>
  )
}
